import { describe, expect, it } from 'vitest'
import type { SearchHit } from '@shared/ipc'
import { fuzzyRank, fuzzyScore } from './fuzzyMatch'

function hit(relPath: string): SearchHit {
  const name = relPath.split('/').pop() ?? relPath
  return { relPath, name, type: 'file' }
}

describe('fuzzyScore', () => {
  it('matches an out-of-run subsequence (happy path)', () => {
    expect(fuzzyScore('usexp', 'useExplorer.ts')).not.toBeNull()
  })

  it('returns null when a query char is missing', () => {
    expect(fuzzyScore('xyz', 'useExplorer.ts')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(fuzzyScore('USEEXP', 'useExplorer.ts')).not.toBeNull()
  })

  it('scores an empty query as neutral (matches everything)', () => {
    expect(fuzzyScore('', 'anything.ts')).toBe(0)
  })

  it('ranks a contiguous boundary match above a scattered one', () => {
    const contiguous = fuzzyScore('explorer', 'Explorer.tsx')
    const scattered = fuzzyScore('explorer', 'e_x_p_l_o_r_e_r.tsx')
    expect(contiguous).not.toBeNull()
    expect(scattered).not.toBeNull()
    expect(contiguous as number).toBeGreaterThan(scattered as number)
  })
})

describe('fuzzyRank', () => {
  it('filters non-matches and orders best-first', () => {
    const hits = [hit('docs/readme.md'), hit('src/useExplorer.ts'), hit('src/explorer.ts')]
    const ranked = fuzzyRank('explorer', hits)
    expect(ranked.map((h) => h.name)).toEqual(['explorer.ts', 'useExplorer.ts'])
  })

  it('returns an empty array when nothing matches', () => {
    expect(fuzzyRank('zzz', [hit('a.ts'), hit('b.ts')])).toEqual([])
  })
})
