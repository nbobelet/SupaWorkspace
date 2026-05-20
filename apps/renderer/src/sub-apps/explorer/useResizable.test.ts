import { describe, expect, it } from 'vitest'
import {
  clampPreviewWidth,
  defaultPreviewWidth,
  shouldCollapseAt,
  PREVIEW_MIN_WIDTH,
  PREVIEW_MAX_WIDTH,
  PREVIEW_COLLAPSE_THRESHOLD,
} from './explorerPreviewStore'

describe('clampPreviewWidth', () => {
  it('clamps below the min up to the min', () => {
    expect(clampPreviewWidth(100)).toBe(PREVIEW_MIN_WIDTH)
    expect(clampPreviewWidth(0)).toBe(PREVIEW_MIN_WIDTH)
  })

  it('clamps above the max down to the max', () => {
    expect(clampPreviewWidth(9999)).toBe(PREVIEW_MAX_WIDTH)
  })

  it('passes through a value within bounds (rounded)', () => {
    expect(clampPreviewWidth(400)).toBe(400)
    expect(clampPreviewWidth(399.6)).toBe(400)
  })

  it('caps the max at the viewport width when given', () => {
    expect(clampPreviewWidth(600, 350)).toBe(350)
    // viewport below the min still yields a coherent (viewport-sized) result
    expect(clampPreviewWidth(600, 200)).toBe(200)
  })
})

describe('defaultPreviewWidth', () => {
  it('is ~28% of the viewport, clamped into bounds', () => {
    expect(defaultPreviewWidth(1000)).toBe(PREVIEW_MIN_WIDTH) // 280 == min
    expect(defaultPreviewWidth(1600)).toBe(448)
    expect(defaultPreviewWidth(4000)).toBe(PREVIEW_MAX_WIDTH) // 1120 -> capped
  })

  it('falls back to a sane default with no viewport', () => {
    const w = defaultPreviewWidth()
    expect(w).toBeGreaterThanOrEqual(PREVIEW_MIN_WIDTH)
    expect(w).toBeLessThanOrEqual(PREVIEW_MAX_WIDTH)
  })
})

describe('shouldCollapseAt', () => {
  it('collapses below the threshold only', () => {
    expect(shouldCollapseAt(PREVIEW_COLLAPSE_THRESHOLD - 1)).toBe(true)
    expect(shouldCollapseAt(50)).toBe(true)
    expect(shouldCollapseAt(PREVIEW_COLLAPSE_THRESHOLD)).toBe(false)
    expect(shouldCollapseAt(300)).toBe(false)
  })
})
