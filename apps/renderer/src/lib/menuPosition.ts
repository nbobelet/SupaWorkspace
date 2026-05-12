export const VIEWPORT_MARGIN = 4

interface ClampInput {
  x: number
  y: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}

/**
 * Clamps a popup menu opened at `(x, y)` so it stays inside the viewport.
 * Pure function — easy to unit-test, no DOM access.
 */
export function clampMenuPosition({
  x,
  y,
  width,
  height,
  viewportWidth,
  viewportHeight,
  margin = VIEWPORT_MARGIN,
}: ClampInput): { left: number; top: number } {
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const maxTop = Math.max(margin, viewportHeight - height - margin)
  const left = Math.min(Math.max(margin, x), maxLeft)
  const top = Math.min(Math.max(margin, y), maxTop)
  return { left, top }
}
