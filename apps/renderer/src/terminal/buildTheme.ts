import type { ITheme } from '@xterm/xterm'
import type { DesignTokens } from '../hooks/useDesignTokens'

/**
 * Parse a CSS color string into rgb components.
 *
 * xterm.js's internal color parser is strict and does NOT understand
 * `color-mix(...)` or modern CSS color spaces. To produce an alpha-composed
 * selection color we resolve the source token to an `{r,g,b}` triple here
 * and emit a plain `rgba(...)` string, which xterm parses reliably.
 *
 * Supported input forms:
 *   - `#rgb`
 *   - `#rgba`
 *   - `#rrggbb`
 *   - `#rrggbbaa`
 *   - `rgb(r, g, b)` / `rgb(r g b)` / `rgba(r, g, b, a)`
 */
interface Rgb {
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

function parseColor(input: string): Rgb {
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

function rgba(input: string, alpha: number): string {
  const { r, g, b } = parseColor(input)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Pure mapping: design tokens -> xterm.js ITheme.
 *
 * Selection colors are alpha-composed at 30% / 15% by re-parsing
 * `tokens.accent` to an rgb triple and emitting `rgba(...)` (xterm doesn't
 * grok `color-mix()`).
 */
export function buildTheme(tokens: DesignTokens): ITheme {
  return {
    background: tokens.bg,
    foreground: tokens.fg,
    cursor: tokens.accent,
    cursorAccent: tokens.bg,
    selectionBackground: rgba(tokens.accent, 0.3),
    selectionInactiveBackground: rgba(tokens.accent, 0.15),
    selectionForeground: tokens.fg,
    black: tokens.ansiBlack,
    red: tokens.error,
    green: tokens.running,
    yellow: tokens.warn,
    blue: tokens.ansiBlue,
    magenta: tokens.ansiMagenta,
    cyan: tokens.ansiCyan,
    white: tokens.ansiWhite,
    brightBlack: tokens.ansiBrightBlack,
    brightRed: tokens.ansiBrightRed,
    brightGreen: tokens.ansiBrightGreen,
    brightYellow: tokens.ansiBrightYellow,
    brightBlue: tokens.ansiBrightBlue,
    brightMagenta: tokens.ansiBrightMagenta,
    brightCyan: tokens.ansiBrightCyan,
    brightWhite: tokens.ansiBrightWhite,
  }
}
