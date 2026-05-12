import { describe, expect, it } from 'vitest'
import { clampMenuPosition } from './menuPosition'

const vw = 1024
const vh = 768
const w = 200
const h = 150

describe('clampMenuPosition', () => {
  it('keeps the menu at the cursor when there is room on both sides', () => {
    expect(
      clampMenuPosition({ x: 400, y: 300, width: w, height: h, viewportWidth: vw, viewportHeight: vh }),
    ).toEqual({ left: 400, top: 300 })
  })

  it('clamps to the right edge when the cursor is near the right viewport border', () => {
    const res = clampMenuPosition({
      x: vw - 20,
      y: 300,
      width: w,
      height: h,
      viewportWidth: vw,
      viewportHeight: vh,
    })
    expect(res.left).toBe(vw - w - 4)
    expect(res.top).toBe(300)
  })

  it('clamps to the bottom edge when the cursor is near the bottom viewport border', () => {
    const res = clampMenuPosition({
      x: 400,
      y: vh - 20,
      width: w,
      height: h,
      viewportWidth: vw,
      viewportHeight: vh,
    })
    expect(res.left).toBe(400)
    expect(res.top).toBe(vh - h - 4)
  })

  it('clamps to both edges simultaneously in the bottom-right corner', () => {
    const res = clampMenuPosition({
      x: vw - 5,
      y: vh - 5,
      width: w,
      height: h,
      viewportWidth: vw,
      viewportHeight: vh,
    })
    expect(res.left).toBe(vw - w - 4)
    expect(res.top).toBe(vh - h - 4)
  })

  it('snaps negative cursor positions to the margin', () => {
    const res = clampMenuPosition({
      x: -50,
      y: -10,
      width: w,
      height: h,
      viewportWidth: vw,
      viewportHeight: vh,
    })
    expect(res.left).toBe(4)
    expect(res.top).toBe(4)
  })

  it('falls back to the margin when the menu is wider than the viewport', () => {
    const res = clampMenuPosition({
      x: 0,
      y: 0,
      width: 2000,
      height: 1500,
      viewportWidth: vw,
      viewportHeight: vh,
      margin: 8,
    })
    expect(res.left).toBe(8)
    expect(res.top).toBe(8)
  })
})
