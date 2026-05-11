import { describe, expect, it } from 'vitest'
import { PALETTE_HUES, angularDistance, pickWorkspaceHue } from './pickWorkspaceHue'

describe('angularDistance', () => {
  it('handles linear distance under 180', () => {
    expect(angularDistance(15, 45)).toBe(30)
    expect(angularDistance(100, 130)).toBe(30)
  })

  it('wraps around 360 (358 vs 2 = 4)', () => {
    expect(angularDistance(358, 2)).toBe(4)
    expect(angularDistance(2, 358)).toBe(4)
    expect(angularDistance(350, 10)).toBe(20)
  })

  it('treats identical hues as 0', () => {
    expect(angularDistance(95, 95)).toBe(0)
  })

  it('handles opposite hues (180)', () => {
    expect(angularDistance(0, 180)).toBe(180)
  })
})

describe('pickWorkspaceHue', () => {
  it('returns first palette entry when no workspaces exist', () => {
    expect(pickWorkspaceHue([])).toBe(15)
  })

  it('picks hue with maximum min-distance from a single existing hue at 95', () => {
    const picked = pickWorkspaceHue([95])
    expect(angularDistance(picked, 95)).toBeGreaterThanOrEqual(40)
    expect(PALETTE_HUES).toContain(picked)
  })

  it('handles a full palette gracefully (no crash, returns valid hue)', () => {
    const picked = pickWorkspaceHue([...PALETTE_HUES])
    expect(PALETTE_HUES).toContain(picked)
  })

  it('treats 358 and 2 as close (4° apart)', () => {
    const picked = pickWorkspaceHue([358])
    expect(picked).not.toBe(15)
    expect(angularDistance(picked, 358)).toBeGreaterThan(40)
  })

  it('respects Δhue ≥ 40° guard when achievable', () => {
    const picked = pickWorkspaceHue([15, 145])
    for (const existing of [15, 145]) {
      expect(angularDistance(picked, existing)).toBeGreaterThanOrEqual(40)
    }
  })
})
