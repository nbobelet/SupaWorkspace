import { execFile, spawn } from 'node:child_process'
import { readdir, realpath, stat } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { FileEntry, FileGitStatus } from '@shared/ipc'

const execFileAsync = promisify(execFile)

/**
 * Cap on entries returned for a single Miller column. The Explorer is lazy —
 * one directory level per call — but a pathological directory (e.g. a cache
 * with 100k siblings) would still flood the IPC channel and the renderer, so
 * we truncate. `truncated` on the result lets the UI hint "showing first N".
 */
const MAX_ENTRIES = 5_000

export type ListDirResult =
  | { status: 'ok'; relPath: string; entries: FileEntry[]; truncated: boolean }
  | { status: 'needs-grant'; path: string }

/**
 * Resolve `relPath` against `rootPath`, rejecting any `..` escape and any
 * symlink whose realpath points outside the scope (OWASP path traversal).
 * Returns the clamped absolute path, or `null` when the target lies outside
 * the workspace scope (caller surfaces a structured `needs-grant`).
 */
export async function clampToScope(rootPath: string, relPath: string): Promise<string | null> {
  const base = resolve(rootPath)
  const target = resolve(base, relPath)
  if (!isInside(base, target)) return null
  // Defeat symlink escapes: a path can be lexically inside the scope yet point
  // (via a link component) outside it. realpath collapses links; if the real
  // location leaves the scope, deny. The base itself is realpath'd too so a
  // symlinked workspace root compares like-for-like.
  try {
    const realBase = await realpath(base)
    const realTarget = await realpath(target)
    if (!isInside(realBase, realTarget)) return null
  } catch {
    // Target does not exist (or is unreadable) — let the caller's readdir
    // surface the real error rather than masking it as a scope denial.
  }
  return target
}

function isInside(root: string, target: string): boolean {
  if (target === root) return true
  const withSep = root.endsWith(sep) ? root : root + sep
  return target.startsWith(withSep)
}

/**
 * One non-recursive directory listing for the Explorer's Miller columns.
 *
 * Security: clamps `relPath` to `rootPath`, rejects `..` escapes and symlinks
 * that resolve outside the scope. Out-of-scope requests return a structured
 * `needs-grant` result rather than throwing.
 *
 * Performance: a single `git status --porcelain=v2` and a single batched
 * `git check-ignore` per directory — never one git invocation per file.
 * Degrades gracefully (no git decoration / filtering) outside a repo.
 */
export async function listDir(rootPath: string, relPath: string): Promise<ListDirResult> {
  const startedAt = Date.now()
  const dir = await clampToScope(rootPath, relPath)
  if (dir === null) {
    return { status: 'needs-grant', path: resolve(rootPath, relPath) }
  }

  const dirents = await readdir(dir, { withFileTypes: true })
  const base = resolve(rootPath)

  const ignored = await checkIgnored(
    base,
    dirents.map((d) => resolve(dir, d.name)),
  )
  const statusByPath = await gitStatusForDir(base, dir)

  const entries: FileEntry[] = []
  let truncated = false
  for (const dirent of dirents) {
    const abs = resolve(dir, dirent.name)
    // The `.git` directory (or gitdir-link file in worktrees/submodules) is
    // git plumbing, never user content — hide it like every file browser does.
    if (dirent.name === '.git') continue
    if (ignored.has(abs)) continue
    if (entries.length >= MAX_ENTRIES) {
      truncated = true
      break
    }

    const type = await entryType(dirent, abs)
    if (type === null) continue
    const size = type === 'file' ? await fileSize(abs) : 0
    const gitStatus = statusByPath.get(abs)

    entries.push({
      name: dirent.name,
      path: abs,
      type,
      ...(gitStatus ? { gitStatus } : {}),
      size,
    })
  }

  entries.sort(byDirThenName)

  const elapsed = Date.now() - startedAt
  console.log(`[explorer] listDir "${relPath || '.'}" -> ${entries.length} entries in ${elapsed}ms`)

  return { status: 'ok', relPath, entries, truncated }
}

/** dir/file classification, following symlinks via stat (already scope-checked). */
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

async function fileSize(abs: string): Promise<number> {
  try {
    return (await stat(abs)).size
  } catch {
    return 0
  }
}

function byDirThenName(a: FileEntry, b: FileEntry): number {
  if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
  return a.name.localeCompare(b.name)
}

/**
 * Batched `git check-ignore`: one process for the whole directory, candidate
 * paths fed on stdin (`--stdin -z`). stdin avoids both an argv length cap on
 * large directories and any path being mistaken for a flag. Returns the subset
 * git considers ignored; an empty set outside a repo (graceful degradation).
 *
 * `git check-ignore -z` is only valid WITH `--stdin` (it rejects `-z` for argv
 * paths), so this path must use the stdin form — hence spawn, not execFile.
 */
async function checkIgnored(cwd: string, paths: string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set()
  const stdout = await new Promise<string>((resolveOut) => {
    const child = spawn('git', ['check-ignore', '--stdin', '-z'], { cwd })
    let out = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      out += chunk
    })
    // Exit 0 = some matched, 1 = none matched, 128 = not a repo. We only ever
    // act on what reached stdout, so any exit collapses to the gathered output.
    child.on('close', () => resolveOut(out))
    child.on('error', () => resolveOut(''))
    child.stdin.on('error', () => {
      /* repo-less git closes stdin early; ignore EPIPE. */
    })
    child.stdin.write(paths.join('\0'))
    child.stdin.end()
  })
  return parseNulPaths(stdout)
}

function parseNulPaths(stdout: string): Set<string> {
  const out = new Set<string>()
  for (const p of stdout.split('\0')) {
    if (p) out.add(resolve(p))
  }
  return out
}

/**
 * Single `git status --porcelain=v2` for the directory, mapped onto the
 * direct children of `dir`. Status lines carry repo-relative paths; we
 * resolve them against the repo root (the cwd we run git from is the
 * workspace base, which may be a subdir — so we anchor on the actual
 * `git rev-parse --show-toplevel`). Returns an empty map outside a repo.
 */
async function gitStatusForDir(base: string, dir: string): Promise<Map<string, FileGitStatus>> {
  const toplevel = await gitToplevel(base)
  if (toplevel === null) return new Map()
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['status', '--porcelain=v2', '-z', '--untracked-files=all', '--ignored=no'],
      { cwd: base, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    )
    return mapPorcelainV2(stdout, toplevel, dir)
  } catch {
    return new Map()
  }
}

async function gitToplevel(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--show-toplevel'], {
      cwd,
      encoding: 'utf8',
    })
    return resolve(stdout.trim())
  } catch {
    return null
  }
}

/**
 * Parse NUL-delimited `--porcelain=v2` output and collapse each entry to a
 * single status for the child of `dir` that contains it. A nested dirty file
 * (e.g. `src/a/b.ts` when listing `src/`) bubbles up as a `modified` mark on
 * the `src/a` directory child, so the column shows which folders are dirty.
 */
function mapPorcelainV2(stdout: string, toplevel: string, dir: string): Map<string, FileGitStatus> {
  const out = new Map<string, FileGitStatus>()
  const records = stdout.split('\0')
  for (let i = 0; i < records.length; i++) {
    const line = records[i]
    if (!line) continue
    const parsed = parsePorcelainRecord(line, records, i)
    if (!parsed) continue
    // Renamed entries (record type '2') consume the following NUL field
    // (the original path); skip it so we don't misread it as a record.
    if (parsed.consumedNext) i++

    const abs = resolve(toplevel, parsed.repoRelPath)
    const child = directChild(dir, abs)
    if (child === null) continue

    const existing = out.get(child)
    // A directory aggregates many files; keep the first concrete status but
    // never downgrade a real status to undefined.
    if (!existing) out.set(child, parsed.status)
  }
  return out
}

interface ParsedRecord {
  status: FileGitStatus
  repoRelPath: string
  consumedNext: boolean
}

function parsePorcelainRecord(line: string, records: string[], index: number): ParsedRecord | null {
  const kind = line[0]
  // '?' untracked, '!' ignored, '1' ordinary change, '2' rename/copy,
  // 'u' unmerged. Fields are space-separated; path is the tail.
  if (kind === '?') {
    return { status: 'untracked', repoRelPath: line.slice(2), consumedNext: false }
  }
  if (kind === '!') {
    return { status: 'ignored', repoRelPath: line.slice(2), consumedNext: false }
  }
  if (kind === 'u') {
    const path = line.split(' ').slice(10).join(' ')
    return { status: 'conflicted', repoRelPath: path, consumedNext: false }
  }
  if (kind === '1') {
    const fields = line.split(' ')
    const xy = fields[1] ?? '..'
    const path = fields.slice(8).join(' ')
    return { status: xyToStatus(xy), repoRelPath: path, consumedNext: false }
  }
  if (kind === '2') {
    const fields = line.split(' ')
    const path = fields.slice(9).join(' ')
    // The original path is the next NUL-delimited field; flag it consumed.
    const hasOrig = index + 1 < records.length
    return { status: 'renamed', repoRelPath: path, consumedNext: hasOrig }
  }
  return null
}

function xyToStatus(xy: string): FileGitStatus {
  const x = xy[0] ?? '.'
  const y = xy[1] ?? '.'
  if (x === 'A' || y === 'A') return 'added'
  if (x === 'D' || y === 'D') return 'deleted'
  if (x === 'R' || y === 'R') return 'renamed'
  return 'modified'
}

/**
 * Map an absolute path to the direct child of `dir` on its way, or `null` if
 * `abs` isn't under `dir`. `dir/a/b/c` listed at `dir` -> `dir/a`.
 */
function directChild(dir: string, abs: string): string | null {
  const dirResolved = resolve(dir)
  const withSep = dirResolved.endsWith(sep) ? dirResolved : dirResolved + sep
  if (!abs.startsWith(withSep)) return null
  const rest = abs.slice(withSep.length)
  const firstSeg = rest.split(sep)[0]
  if (!firstSeg) return null
  return resolve(dirResolved, firstSeg)
}
