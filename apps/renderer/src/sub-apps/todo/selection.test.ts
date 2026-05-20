import { describe, expect, it } from 'vitest'
import {
  marqueeHits,
  rangeSelection,
  rectFromPoints,
  rectsIntersect,
  resolveActionTargets,
  toggleSelection,
  type CardRect,
} from './selection'

const r = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

describe('rectFromPoints', () => {
  it('normalizes any corner order into a positive rect', () => {
    expect(rectFromPoints({ x: 30, y: 40 }, { x: 10, y: 5 })).toEqual(r(10, 5, 30, 40))
  })
})

describe('rectsIntersect', () => {
  it('detects overlap and disjointness', () => {
    expect(rectsIntersect(r(0, 0, 10, 10), r(5, 5, 15, 15))).toBe(true)
    expect(rectsIntersect(r(0, 0, 10, 10), r(20, 20, 30, 30))).toBe(false)
  })
})

describe('marqueeHits', () => {
  const cards: CardRect[] = [
    { id: 'a', rect: r(0, 0, 10, 10) },
    { id: 'b', rect: r(0, 20, 10, 30) },
    { id: 'c', rect: r(0, 40, 10, 50) },
  ]

  it('returns only intersecting cards, in input order', () => {
    expect(marqueeHits(r(0, 5, 10, 25), cards)).toEqual(['a', 'b'])
  })

  it('returns nothing when the box misses every card', () => {
    expect(marqueeHits(r(100, 100, 110, 110), cards)).toEqual([])
  })

  it('confinement: a box only ever hits the cards it is given (one column)', () => {
    // Caller passes a single column's cards, so a marquee can never select
    // across columns even if another column's card shares a y-band.
    const colA: CardRect[] = [{ id: 'a1', rect: r(0, 0, 10, 10) }]
    expect(marqueeHits(r(0, 0, 200, 200), colA)).toEqual(['a1'])
  })
})

describe('toggleSelection', () => {
  it('adds then removes immutably', () => {
    const empty = new Set<string>()
    const withA = toggleSelection(empty, 'a')
    expect([...withA]).toEqual(['a'])
    expect([...empty]).toEqual([])
    expect([...toggleSelection(withA, 'a')]).toEqual([])
  })
})

describe('rangeSelection', () => {
  const order = ['a', 'b', 'c', 'd', 'e']

  it('selects the contiguous slice regardless of endpoint order', () => {
    expect(rangeSelection(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeSelection(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
  })

  it('falls back to the target when an endpoint is absent (e.g. cross-column anchor)', () => {
    expect(rangeSelection(order, 'zzz', 'c')).toEqual(['c'])
  })
})

describe('resolveActionTargets (dispatcher)', () => {
  const selection = new Set(['a', 'b'])

  it('selection-capable + clicked card in selection => all selected', () => {
    expect(resolveActionTargets('selection', 'a', selection).sort()).toEqual(['a', 'b'])
  })

  it('selection-capable + clicked card NOT in selection => single fallback', () => {
    expect(resolveActionTargets('selection', 'z', selection)).toEqual(['z'])
  })

  it('single scope always acts on the clicked card alone', () => {
    expect(resolveActionTargets('single', 'a', selection)).toEqual(['a'])
  })

  it('empty selection => single fallback', () => {
    expect(resolveActionTargets('selection', 'a', new Set())).toEqual(['a'])
  })
})
