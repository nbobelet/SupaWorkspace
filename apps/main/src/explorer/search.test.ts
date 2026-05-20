import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelSearch, clearSearchCache, search } from './search'
import * as listDir from './list-dir'

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function initRepo(root: string): void {
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'config', 'commit.gpgsign', 'false')
}

describe('search walk', () => {
  let root: string
  let workspaceId: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'explorer-search-'))
    workspaceId = randomUUID()
  })

  afterEach(() => {
    clearSearchCache()
    vi.restoreAllMocks()
    rmSync(root, { recursive: true, force: true })
  })

  it('returns nested candidates with POSIX workspace-relative paths', async () => {
    mkdirSync(join(root, 'src', 'lib'), { recursive: true })
    writeFileSync(join(root, 'src', 'lib', 'deep.ts'), 'export const x = 1')
    writeFileSync(join(root, 'top.ts'), 'y')

    const result = await search(workspaceId, root, 0)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    expect(result.truncated).toBe(false)
    const rels = result.hits.map((h) => h.relPath)
    expect(rels).toContain('top.ts')
    expect(rels).toContain('src')
    expect(rels).toContain('src/lib')
    expect(rels).toContain('src/lib/deep.ts')
    // POSIX separators regardless of host OS.
    expect(rels.every((r) => !r.includes('\\'))).toBe(true)
  })

  it('prunes the .git dir and git-ignored entries from the walk', async () => {
    initRepo(root)
    writeFileSync(join(root, '.gitignore'), 'node_modules/\nsecret.txt\n')
    mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
    writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), 'x')
    writeFileSync(join(root, 'secret.txt'), 'nope')
    writeFileSync(join(root, 'kept.ts'), 'export const a = 1')

    const result = await search(workspaceId, root, 0)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') throw new Error('expected ok')
    const rels = result.hits.map((h) => h.relPath)
    expect(rels).toContain('kept.ts')
    expect(rels.some((r) => r === 'node_modules' || r.startsWith('node_modules/'))).toBe(false)
    expect(rels).not.toContain('secret.txt')
    expect(rels).not.toContain('.git')
    expect(rels.some((r) => r.startsWith('.git/'))).toBe(false)
  })

  it('reuses the cached index on a second search for the same workspace (no second walk)', async () => {
    mkdirSync(join(root, 'sub'), { recursive: true })
    writeFileSync(join(root, 'a.ts'), 'x')
    writeFileSync(join(root, 'sub', 'b.ts'), 'y')

    // checkIgnored fires exactly once per directory the walk descends into; a
    // cache hit must not walk again, so the call count stays frozen.
    const ignoredSpy = vi.spyOn(listDir, 'checkIgnored')

    const first = await search(workspaceId, root, 0)
    expect(first.status).toBe('ok')
    const callsAfterFirst = ignoredSpy.mock.calls.length
    expect(callsAfterFirst).toBeGreaterThan(0)

    const second = await search(workspaceId, root, 1)
    expect(second.status).toBe('ok')
    // No additional checkIgnored => the index was served from cache.
    expect(ignoredSpy.mock.calls.length).toBe(callsAfterFirst)
    if (first.status === 'ok' && second.status === 'ok') {
      expect(second.hits).toEqual(first.hits)
    }
  })

  it('aborts the walk for a cancelled searchId and returns a cancelled status', async () => {
    mkdirSync(join(root, 'a', 'b'), { recursive: true })
    writeFileSync(join(root, 'a', 'b', 'deep.ts'), 'x')
    writeFileSync(join(root, 'top.ts'), 'y')

    // checkIgnored runs once per directory before that directory's entries are
    // pushed — cancel inside it so the walk bails before completing.
    const searchId = 7
    vi.spyOn(listDir, 'checkIgnored').mockImplementation(async () => {
      cancelSearch(workspaceId, searchId)
      return new Set<string>()
    })

    const result = await search(workspaceId, root, searchId)
    expect(result.status).toBe('cancelled')
    // A cancelled walk must not populate the cache (no stale partial index).
    const after = await search(workspaceId, root, searchId + 1)
    expect(after.status).toBe('ok')
  })

  it('invalidates the cached index when the workspace rootPath changes', async () => {
    writeFileSync(join(root, 'old.ts'), 'x')
    const first = await search(workspaceId, root, 0)
    expect(first.status).toBe('ok')
    if (first.status === 'ok') {
      expect(first.hits.map((h) => h.relPath)).toContain('old.ts')
    }

    const root2 = mkdtempSync(join(tmpdir(), 'explorer-search-2-'))
    try {
      writeFileSync(join(root2, 'new.ts'), 'y')
      // Same workspaceId, different rootPath => the stale index must be dropped
      // and the new tree walked (no cross-scope leakage).
      const second = await search(workspaceId, root2, 1)
      expect(second.status).toBe('ok')
      if (second.status === 'ok') {
        const rels = second.hits.map((h) => h.relPath)
        expect(rels).toContain('new.ts')
        expect(rels).not.toContain('old.ts')
      }
    } finally {
      rmSync(root2, { recursive: true, force: true })
    }
  })
})
