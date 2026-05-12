import type { ITheme } from '@xterm/xterm'
import type { DesignTokens } from '../hooks/useDesignTokens'
import { rgba } from './colors'

/**
 * Pure mapping: design tokens -> xterm.js ITheme.
 *
 * Selection colors are alpha-composed at 30% / 15% by re-parsing
 * `tokens.accent` to an rgb triple (via `colors.ts`) and emitting
 * `rgba(...)` — xterm doesn't grok `color-mix()`. The same parser is
 * re-used by the `MarkerRegistry` to emit `#RRGGBB[AA]` decoration
 * colors, so the alpha-composition logic now lives in one place.
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
