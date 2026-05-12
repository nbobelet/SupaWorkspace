/**
 * Color helpers shared by `buildTheme` and `MarkerRegistry`.
 *
 * xterm.js is strict about color formats:
 *   - `ITheme.selectionBackground` accepts any CSS color string xterm can
 *     parse — `rgba(...)` works, `color-mix(...)` does NOT.
 *   - `IDecorationOptions.backgroundColor` / `foregroundColor` and the
 *     `ISearchDecorationOptions.matchBackground` family only accept the
 *     `#RRGGBB` (or `#RRGGBBAA`) form.
 *   - `overviewRulerOptions.color` is forgiving and accepts hex.
 *
 * Both helpers re-parse the source token to an `{r,g,b}` triple so they
 * survive future migrations of the design-token system (e.g. `oklch(...)`
 * or `color(display-p3 ...)`).
 */

export interface Rgb {
  r: number
  g: number
  b: number
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 255) return 255
  return Math.round(n)
}

/**
 * Parse a CSS color string into rgb components. Returns `{0,0,0}` on
 * unparseable inputs — callers fall back to a sane default color in
 * practice.
 *
 * Supported input forms:
 *   - `#rgb` / `#rgba`
 *   - `#rrggbb` / `#rrggbbaa`
 *   - `rgb(r, g, b)` / `rgb(r g b)` / `rgba(r, g, b, a)`
 */
export function parseColor(input: string): Rgb {
  const value = input.trim().toLowerCase()
  const fallback: Rgb = { r: 0, g: 0, b: 0 }
  if (value.length === 0) return fallback

  if (value.startsWith('#')) {
    const hex = value.slice(1)
    if (hex.length === 3 || hex.length === 4) {
      const r = hex[0]
      const g = hex[1]
      const b = hex[2]
      if (r === undefined || g === undefined || b === undefined) return fallback
      return {
        r: clampByte(parseInt(r + r, 16)),
        g: clampByte(parseInt(g + g, 16)),
        b: clampByte(parseInt(b + b, 16)),
      }
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: clampByte(parseInt(hex.slice(0, 2), 16)),
        g: clampByte(parseInt(hex.slice(2, 4), 16)),
        b: clampByte(parseInt(hex.slice(4, 6), 16)),
      }
    }
    return fallback
  }

  const rgbMatch = value.match(/^rgba?\(([^)]+)\)$/)
  if (rgbMatch && rgbMatch[1] !== undefined) {
    const parts = rgbMatch[1].split(/[\s,/]+/).filter((s) => s.length > 0)
    const rPart = parts[0]
    const gPart = parts[1]
    const bPart = parts[2]
    if (rPart === undefined || gPart === undefined || bPart === undefined) return fallback
    return {
      r: clampByte(Number(rPart)),
      g: clampByte(Number(gPart)),
      b: clampByte(Number(bPart)),
    }
  }

  return fallback
}

/**
 * Compose a `rgba(...)` string at the requested alpha. Used by `buildTheme`
 * for selection colors (xterm accepts rgba on the theme path).
 */
export function rgba(input: string, alpha: number): string {
  const { r, g, b } = parseColor(input)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Normalize to the strict `#RRGGBB` form xterm requires for decoration
 * options (`matchBackground`, `activeMatchBackground`, etc.).
 */
export function toHex(input: string): string {
  const { r, g, b } = parseColor(input)
  const hh = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${hh(r)}${hh(g)}${hh(b)}`
}

/**
 * Compose `#RRGGBBAA` with an explicit 0..1 alpha component, suitable
 * for the SearchAddon `matchBackground` / `activeMatchBackground` fields
 * (the addon accepts the 8-digit hex form even though the typings claim
 * `#RRGGBB`).
 */
export function toHexAlpha(input: string, alpha: number): string {
  const { r, g, b } = parseColor(input)
  const a = Math.max(0, Math.min(1, alpha))
  const aByte = Math.round(a * 255)
  const hh = (n: number): string => n.toString(16).padStart(2, '0')
  return `#${hh(r)}${hh(g)}${hh(b)}${hh(aByte)}`
}
