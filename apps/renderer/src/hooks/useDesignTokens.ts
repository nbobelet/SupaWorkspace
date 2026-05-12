import { useEffect, useState } from 'react'

/**
 * Snapshot of every design token consumed by the terminal renderer.
 * Sourced from CSS custom properties on `:root`. Single source of truth
 * for `buildTheme()` in `../terminal/buildTheme.ts`.
 *
 * Token names map to the repo's Tailwind 4 `@theme` block in
 * `../styles/index.css` (semantic tokens are prefixed `--color-*`; ANSI
 * palette tokens are prefixed `--ansi-*`).
 */
export interface DesignTokens {
  // Semantic surfaces
  bg: string
  bgSunken: string
  bgElevated: string
  fg: string
  fgSubtle: string
  muted: string
  accent: string
  running: string
  warn: string
  error: string
  border: string
  borderStrong: string
  // ANSI 16-color palette
  ansiBlack: string
  ansiRed: string
  ansiGreen: string
  ansiYellow: string
  ansiBlue: string
  ansiMagenta: string
  ansiCyan: string
  ansiWhite: string
  ansiBrightBlack: string
  ansiBrightRed: string
  ansiBrightGreen: string
  ansiBrightYellow: string
  ansiBrightBlue: string
  ansiBrightMagenta: string
  ansiBrightCyan: string
  ansiBrightWhite: string
}

/**
 * Pure read of the design-token snapshot from `document.documentElement`.
 * Exported because `useTerminalSession.getOrCreateHandle()` is called outside
 * any React render context and must NOT depend on a hook.
 */
export function readDesignTokens(): DesignTokens {
  const root = document.documentElement
  const styles = getComputedStyle(root)
  const read = (name: string): string => styles.getPropertyValue(name).trim()

  return {
    bg: read('--color-bg'),
    bgSunken: read('--color-bg-sunken'),
    bgElevated: read('--color-bg-elevated'),
    fg: read('--color-fg'),
    fgSubtle: read('--color-fg-subtle'),
    muted: read('--color-muted'),
    accent: read('--color-accent'),
    running: read('--color-running'),
    warn: read('--color-warn'),
    error: read('--color-error'),
    border: read('--color-border'),
    borderStrong: read('--color-border-strong'),
    ansiBlack: read('--ansi-black'),
    ansiRed: read('--ansi-red'),
    ansiGreen: read('--ansi-green'),
    ansiYellow: read('--ansi-yellow'),
    ansiBlue: read('--ansi-blue'),
    ansiMagenta: read('--ansi-magenta'),
    ansiCyan: read('--ansi-cyan'),
    ansiWhite: read('--ansi-white'),
    ansiBrightBlack: read('--ansi-bright-black'),
    ansiBrightRed: read('--ansi-bright-red'),
    ansiBrightGreen: read('--ansi-bright-green'),
    ansiBrightYellow: read('--ansi-bright-yellow'),
    ansiBrightBlue: read('--ansi-bright-blue'),
    ansiBrightMagenta: read('--ansi-bright-magenta'),
    ansiBrightCyan: read('--ansi-bright-cyan'),
    ansiBrightWhite: read('--ansi-bright-white'),
  }
}

/**
 * Live design-token snapshot. Re-emits whenever an attribute on
 * `documentElement` mutates (e.g. a future `data-theme` flip), or when the
 * inline `style` attribute is mutated programmatically (test seam +
 * runtime theme tweak via `documentElement.style.setProperty(...)`).
 */
export function useDesignTokens(): DesignTokens {
  const [tokens, setTokens] = useState<DesignTokens>(() => readDesignTokens())

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTokens(readDesignTokens())
    })
    observer.observe(document.documentElement, { attributes: true })
    return () => observer.disconnect()
  }, [])

  return tokens
}
