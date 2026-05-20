import { readdir, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { SearchHit } from '@shared/ipc'
import { checkIgnored, clampToScope } from './list-dir'

/**
 * Entry budget for a single search walk. A search must stay snappy on every
 * keystroke (the renderer debounces but still fires often), so we cap the flat
 * candidate list rather than risk flooding the IPC channel from a monorepo with
 * 100k+ files. `truncated` lets the UI hint that the index is partial.
 */
const MAX_HITS = 10_000

/**
 * Depth cap on the recursive descent. Pathological trees (symlink loops are
 * already defeated by realpath in clampToScope, but deeply generated output
 * dirs are not) would otherwise stall the walk; 12 levels covers any sane
 * source layout while bounding worst-case work.
 */
const MAX_DEPTH = 12

export interface SearchResult {
  hits: SearchHit[]
  truncated: boolean
}

interface WalkState {
  hits: SearchHit[]
  truncated: boolean
  /** Set by `searchCancel` for the currently-running searchId; the recursive
   * walk checks it every iteration and bails so a stale walk never finishes. */
  aborted: boolean
}

/**
 * Cached candidate index for one workspace. The flat list is the expensive part
 * (a full bounded tree walk); subsequent searches for the same workspace reuse
 * it so fast typing doesn't re-walk on every keystroke. The query never reaches
 * main — only the renderer's canonical fuzzy matcher ranks against this list.
 */
interface CachedIndex {
  base: string
  result: SearchResult
}

/** Keyed by workspaceId, NOT rootPath: a workspace whose rootPath changes is a
 * different workspace from the renderer's view, and keying on the resolved base
 * lets us detect an out-of-band rootPath change and invalidate (see `search`). */
const indexCache = new Map<string, CachedIndex>()

/** The walk in flight per workspace, exposed so `cancelSearch` can flip its
 * aborted flag. Only one search runs per workspace at a time from the renderer
 * (it cancels the previous before issuing the next). */
const liveWalks = new Map<string, { searchId: number; state: WalkState }>()

export type SearchOutcome =
  | { status: 'ok'; hits: SearchHit[]; truncated: boolean }
  | { status: 'cancelled' }

/**
 * Bounded recursive walk of the workspace, returning a FLAT capped candidate
 * list (relPath POSIX, name, type). Fuzzy ranking is intentionally NOT done
 * here — main owns the index, the renderer owns the single canonical matcher.
 *
 * The index is cached per workspaceId: the first call walks, later calls reuse
 * the cached list (invalidated when the resolved rootPath changes). Each call
 * carries a monotonic `searchId`; `cancelSearch` aborts the in-flight walk
 * cooperatively so concurrent full-tree walks never pile up.
 *
 * Security/perf mirror `listDir`: the root is clamped to scope, `.git` is never
 * descended, and git-ignored entries are pruned per-directory (one batched
 * `git check-ignore` per level) so we never walk into `node_modules` and the
 * like. Outside a repo `checkIgnored` returns empty and the walk degrades to a
 * plain tree scan.
 */
export async function search(
  workspaceId: string,
  rootPath: string,
  searchId: number,
): Promise<SearchOutcome> {
  const base = await clampToScope(rootPath, '')
  if (base === null) return { status: 'ok', hits: [], truncated: false }

  const cached = indexCache.get(workspaceId)
  if (cached && cached.base === base) {
    return { status: 'ok', hits: cached.result.hits, truncated: cached.result.truncated }
  }
  // A different base for the same workspaceId means the rootPath changed
  // out-of-band — drop the stale index so we never leak another scope's tree.
  if (cached) indexCache.delete(workspaceId)

  const startedAt = Date.now()
  const state: WalkState = { hits: [], truncated: false, aborted: false }
  liveWalks.set(workspaceId, { searchId, state })
  try {
    await walk(base, base, '', 0, state)
  } finally {
    const live = liveWalks.get(workspaceId)
    if (live && live.searchId === searchId) liveWalks.delete(workspaceId)
  }

  if (state.aborted) {
    return { status: 'cancelled' }
  }

  const elapsed = Date.now() - startedAt
  console.log(
    `[explorer] search walk -> ${state.hits.length} candidates${state.truncated ? ' (truncated)' : ''} in ${elapsed}ms`,
  )

  const result: SearchResult = { hits: state.hits, truncated: state.truncated }
  indexCache.set(workspaceId, { base, result })
  return { status: 'ok', hits: result.hits, truncated: result.truncated }
}

/**
 * Abort the in-flight walk for `workspaceId` when `searchId` matches the live
 * search. A mismatched (already-finished or superseded) id is a no-op.
 */
export function cancelSearch(workspaceId: string, searchId: number): void {
  const live = liveWalks.get(workspaceId)
  if (live && live.searchId === searchId) {
    live.state.aborted = true
  }
}

/** Test/teardown hook: drop a workspace's cached index (or all of them). */
export function clearSearchCache(workspaceId?: string): void {
  if (workspaceId === undefined) {
    indexCache.clear()
    liveWalks.clear()
    return
  }
  indexCache.delete(workspaceId)
  liveWalks.delete(workspaceId)
}

async function walk(
  base: string,
  dir: string,
  relPrefix: string,
  depth: number,
  state: WalkState,
): Promise<void> {
  if (state.aborted) return
  if (depth > MAX_DEPTH || state.hits.length >= MAX_HITS) {
    state.truncated = true
    return
  }

  let dirents
  try {
    dirents = await readdir(dir, { withFileTypes: true })
  } catch {
    // A directory deleted mid-walk (or unreadable) is skipped, not fatal.
    return
  }

  const ignored = await checkIgnored(
    base,
    dirents.map((d) => resolve(dir, d.name)),
  )

  for (const dirent of dirents) {
    if (state.aborted) return
    if (state.hits.length >= MAX_HITS) {
      state.truncated = true
      return
    }
    if (dirent.name === '.git') continue
    const abs = resolve(dir, dirent.name)
    if (ignored.has(abs)) continue

    const type = await entryType(dirent, abs)
    if (type === null) continue

    // relPath is built by joining names with '/', so it stays POSIX regardless
    // of the host OS separator (the contract every explorer channel relies on).
    const relPath = relPrefix === '' ? dirent.name : `${relPrefix}/${dirent.name}`
    state.hits.push({ relPath, name: dirent.name, type })

    if (type === 'dir') {
      await walk(base, abs, relPath, depth + 1, state)
    }
  }
}

/** dir/file classification, following symlinks via stat (already scope-checked
 * against the realpath base by clampToScope before the walk begins). */
async function entryType(
  dirent: { isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean },
  abs: string,
): Promise<'file' | 'dir' | null> {
  if (dirent.isDirectory()) return 'dir'
  if (dirent.isFile()) return 'file'
  if (dirent.isSymbolicLink()) {
    try {
      const s = await stat(abs)
      if (s.isDirectory()) return 'dir'
      if (s.isFile()) return 'file'
    } catch {
      return null
    }
  }
  return null
}
