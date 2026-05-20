import { mkdtempSync, rmdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isUsableDir, resolveWithinBase, SafeRelativePath } from './validatePath'

describe('resolveWithinBase', () => {
  it('resolves a plain relative path inside base', () => {
    const base = tmpdir()
    const result = resolveWithinBase(base, 'sub/dir')
    expect(result).toBe(join(base, 'sub', 'dir'))
  })

  it('throws on a ../escape path', () => {
    const base = tmpdir()
    expect(() => resolveWithinBase(base, '../escape')).toThrow('Path traversal rejected')
  })

  it('accepts the base itself (empty input resolves to base)', () => {
    const base = tmpdir()
    expect(() => resolveWithinBase(base, '.')).not.toThrow()
  })

  it('throws on deeply nested traversal', () => {
    const base = tmpdir()
    expect(() => resolveWithinBase(base, 'a/b/../../..')).toThrow('Path traversal rejected')
  })
})

describe('SafeRelativePath', () => {
  it('rejects a path with .. segment', () => {
    expect(SafeRelativePath.safeParse('../x').success).toBe(false)
  })

  it('rejects a nested .. segment', () => {
    expect(SafeRelativePath.safeParse('a/../b').success).toBe(false)
  })

  it('accepts a clean relative path', () => {
    expect(SafeRelativePath.safeParse('sub/dir').success).toBe(true)
  })

  it('accepts a plain filename', () => {
    expect(SafeRelativePath.safeParse('file.txt').success).toBe(true)
  })
})

describe('isUsableDir', () => {
  it('returns false for a non-existent path', () => {
    expect(isUsableDir('/this/path/does/not/exist/at/all')).toBe(false)
  })

  it('returns true for a real temporary directory', () => {
    const dir = mkdtempSync(join(tmpdir(), 'validate-path-test-'))
    try {
      expect(isUsableDir(dir)).toBe(true)
    } finally {
      rmdirSync(dir)
    }
  })
})
