import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listDir } from './list-dir'

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: 'pipe' })
}

function initRepo(root: string): void {
  git(root, 'init', '-q')
  git(root, 'config', 'user.email', 'test@example.com')
  git(root, 'config', 'user.name', 'Test')
  git(root, 'config', 'commit.gpgsign', 'false')
}

describe('listDir', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'explorer-test-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a `..` escape outside rootPath with needs-grant', async () => {
    const result = await listDir(root, '..')
    expect(result.status).toBe('needs-grant')
  })

  it('rejects a deeply nested traversal escape', async () => {
    mkdirSync(join(root, 'sub'))
    const result = await listDir(root, 'sub/../../..')
    expect(result.status).toBe('needs-grant')
  })

  it('filters a gitignored entry out of the listing', async () => {
    initRepo(root)
    writeFileSync(join(root, '.gitignore'), 'node_modules/\nignored.txt\n')
    mkdirSync(join(root, 'node_modules'))
    writeFileSync(join(root, 'node_modules', 'pkg.js'), 'x')
    writeFileSync(join(root, 'ignored.txt'), 'secret')
    writeFileSync(join(root, 'kept.ts'), 'export const a = 1')

    const result = await listDir(root, '')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const names = result.entries.map((e) => e.name)
    expect(names).toContain('kept.ts')
    expect(names).not.toContain('node_modules')
    expect(names).not.toContain('ignored.txt')
  })

  it('maps git status onto a modified tracked file', async () => {
    initRepo(root)
    const file = join(root, 'tracked.ts')
    writeFileSync(file, 'export const v = 1\n')
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', 'init')
    writeFileSync(file, 'export const v = 2\n')

    const result = await listDir(root, '')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const tracked = result.entries.find((e) => e.name === 'tracked.ts')
    expect(tracked).toBeDefined()
    expect(tracked?.gitStatus).toBe('modified')
  })

  it('marks an untracked file and bubbles dirty status to a parent dir', async () => {
    initRepo(root)
    writeFileSync(join(root, 'committed.ts'), 'x\n')
    git(root, 'add', '.')
    git(root, 'commit', '-q', '-m', 'init')
    writeFileSync(join(root, 'new.ts'), 'fresh')
    mkdirSync(join(root, 'src'))
    writeFileSync(join(root, 'src', 'deep.ts'), 'nested')

    const result = await listDir(root, '')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const fresh = result.entries.find((e) => e.name === 'new.ts')
    expect(fresh?.gitStatus).toBe('untracked')
    const srcDir = result.entries.find((e) => e.name === 'src')
    expect(srcDir?.type).toBe('dir')
    expect(srcDir?.gitStatus).toBe('untracked')
  })

  it('hides the .git directory from the listing', async () => {
    initRepo(root)
    writeFileSync(join(root, 'kept.ts'), 'export const a = 1')

    const result = await listDir(root, '')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const names = result.entries.map((e) => e.name)
    expect(names).toContain('kept.ts')
    expect(names).not.toContain('.git')
  })

  it('degrades gracefully (no filtering, no status) outside a git repo', async () => {
    writeFileSync(join(root, 'a.txt'), 'hello')
    mkdirSync(join(root, 'dir'))

    const result = await listDir(root, '')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.entries.map((e) => e.name).sort()).toEqual(['a.txt', 'dir'])
    expect(result.entries.every((e) => e.gitStatus === undefined)).toBe(true)
  })

  it('lists only one directory level (no recursive walk)', async () => {
    mkdirSync(join(root, 'level1'))
    writeFileSync(join(root, 'level1', 'inner.txt'), 'x')
    writeFileSync(join(root, 'top.txt'), 'y')

    const result = await listDir(root, '')
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const names = result.entries.map((e) => e.name)
    expect(names).toContain('level1')
    expect(names).toContain('top.txt')
    expect(names).not.toContain('inner.txt')
  })
})
