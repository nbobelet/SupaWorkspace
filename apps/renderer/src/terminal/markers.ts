import type { IDecoration, IDisposable, IMarker } from '@xterm/xterm'
import type { DesignTokens } from '../hooks/useDesignTokens'
import { toHex, toHexAlpha } from './colors'
import { DEFAULT_ERROR_PATTERNS, DEFAULT_PROMPT_PATTERNS } from './config'

/**
 * Minimum subset of `Terminal` consumed by the marker registry.
 *
 * Declared as a structural type so the Vitest test in `markers.test.ts`
 * can feed a hand-rolled mock without instantiating an xterm.js terminal
 * (jsdom can't host the WebGL renderer, and even DOM-only xterm needs
 * `term.open()`).
 */
export interface MarkerTerminal {
  readonly cols: number
  readonly buffer: {
    readonly active: {
      readonly cursorY: number
      getLine(line: number): { translateToString(trimRight?: boolean): string } | undefined
    }
  }
  registerMarker(cursorYOffset?: number): IMarker
  registerDecoration(options: {
    marker: IMarker
    overviewRulerOptions?: { color: string; position?: 'left' | 'center' | 'right' | 'full' }
  }): IDecoration | undefined
  onLineFeed(listener: () => void): IDisposable
  onCursorMove(listener: () => void): IDisposable
}

export type MarkerKind = 'search' | 'error' | 'boundary'

interface RegistryEntry {
  kind: MarkerKind
  marker: IMarker
  decoration: IDecoration | undefined
  /** Color the decoration was registered with; lets us cheaply detect drift on `updateTokens`. */
  color: string
}

export interface SearchDecorationOptions {
  matchOverviewRuler: string
  activeMatchColorOverviewRuler: string
  matchBackground: string
  activeMatchBackground: string
}

export interface MarkerRegistry {
  /** Build the `decorations` option block that the SearchAddon expects, derived from current tokens. */
  searchDecorationOptions(): SearchDecorationOptions
  /**
   * Hook called by callers (the SearchBar) when the active search term or hit
   * changes. Today the SearchAddon owns its own decoration lifecycle when
   * `decorations` is passed to `findNext/findPrevious`, so this is mostly a
   * marker for future expansion — kept on the public surface so callers do
   * not need to reach for the addon's API directly.
   */
  refreshSearch(query: string, isActive: boolean): void
  /** React to a token mutation — re-color the existing markers (best-effort). */
  updateTokens(next: DesignTokens): void
  /** Dispose every marker + subscription. Idempotent. */
  dispose(): void
}

export interface MarkerRegistryOptions {
  errorPatterns?: ReadonlyArray<RegExp>
  promptPatterns?: ReadonlyArray<RegExp>
}

/**
 * Per-session marker registry. Subscribes to `term.onLineFeed` for the
 * error + boundary detection passes, owns every `IMarker` / `IDecoration`
 * it creates, and disposes them all on `dispose()`.
 *
 * Color policy (kept here so it stays auditable):
 *   - `search`   active hit -> `tokens.warn`
 *   - `search`   other hits -> `tokens.accent`
 *   - `error`               -> `tokens.error`
 *   - `boundary` normal     -> `tokens.muted`
 *   - `boundary` Ctrl+C'd   -> `tokens.warn`
 *
 * `getTokens` is a getter (not a snapshot) so the registry always reads
 * the freshest token snapshot at the moment a marker is created — matches
 * the live-rebind contract Wave 2 set up for `buildTheme`.
 */
export function createMarkerRegistry(
  term: MarkerTerminal,
  getTokens: () => DesignTokens,
  sessionId: string,
  options: MarkerRegistryOptions = {},
): MarkerRegistry {
  const errorPatterns = options.errorPatterns ?? DEFAULT_ERROR_PATTERNS
  const promptPatterns = options.promptPatterns ?? DEFAULT_PROMPT_PATTERNS

  const entries: RegistryEntry[] = []
  const disposables: IDisposable[] = []
  let disposed = false

  // sessionId is captured for symmetry with the larger session-state API
  // surface — referenced once so TypeScript verifies the binding.
  void sessionId

  const addMarker = (kind: MarkerKind, color: string, lineOffset = 0): void => {
    // Doc-comment on xterm 5.5's `registerMarker` warns the call can return
    // undefined (e.g. when the alt-buffer is active). Typings say otherwise,
    // so we double-check at runtime defensively.
    const marker = term.registerMarker(lineOffset) as IMarker | undefined
    if (!marker) return
    const decoration = term.registerDecoration({
      marker,
      overviewRulerOptions: { color: toHex(color), position: 'right' },
    })
    entries.push({ kind, marker, decoration, color })
  }

  const scanLine = (line: string): void => {
    for (const re of errorPatterns) {
      if (re.test(line)) {
        addMarker('error', getTokens().error)
        return
      }
    }
  }

  const isPromptLine = (line: string): boolean => {
    for (const re of promptPatterns) {
      if (re.test(line)) return true
    }
    return false
  }

  const readLastCompletedLine = (): string | null => {
    const buf = term.buffer.active
    const y = buf.cursorY - 1
    if (y < 0) return null
    const handle = buf.getLine(y)
    if (!handle) return null
    return handle.translateToString(true)
  }

  const readCurrentLine = (): string | null => {
    const buf = term.buffer.active
    const handle = buf.getLine(buf.cursorY)
    if (!handle) return null
    return handle.translateToString(true)
  }

  // Error-line scan: fires on every line feed (the line ABOVE the cursor
  // has just been completed). We tolerate over-firing because the regex
  // set is small.
  disposables.push(
    term.onLineFeed(() => {
      const line = readLastCompletedLine()
      if (line === null) return
      scanLine(line)
    }),
  )

  // Boundary detection: when the cursor returns to column 0 after a line
  // that matches the prompt regex, treat the line just above as a
  // command-end boundary. `^C` in the same line bumps the color to
  // `tokens.warn` (SIGINT heuristic).
  let lastPromptLineY = -1
  disposables.push(
    term.onCursorMove(() => {
      const current = readCurrentLine()
      if (current === null) return
      if (!isPromptLine(current)) return
      const buf = term.buffer.active
      if (buf.cursorY === lastPromptLineY) return
      lastPromptLineY = buf.cursorY
      const completed = readLastCompletedLine() ?? ''
      const wasInterrupted = /\^C/.test(completed)
      const tokens = getTokens()
      addMarker('boundary', wasInterrupted ? tokens.warn : tokens.muted, -1)
    }),
  )

  return {
    searchDecorationOptions(): SearchDecorationOptions {
      const tokens = getTokens()
      return {
        matchOverviewRuler: toHex(tokens.accent),
        activeMatchColorOverviewRuler: toHex(tokens.warn),
        // SearchAddon's typings claim `#RRGGBB`, but the runtime accepts
        // the 8-digit hex form for alpha — verified at xterm 5.5. We use
        // 0x40 (~25%) per the brief.
        matchBackground: toHexAlpha(tokens.accent, 0.25),
        activeMatchBackground: toHexAlpha(tokens.warn, 0.25),
      }
    },
    refreshSearch(_query: string, _isActive: boolean): void {
      // SearchAddon owns its own decoration lifecycle when passed a
      // `decorations` option block; nothing to do here today. Hook left in
      // place for symmetry with `error` / `boundary` kinds and for future
      // expansion (e.g. multi-color hit grouping).
      void _query
      void _isActive
    },
    updateTokens(_next: DesignTokens): void {
      // xterm's IDecoration does not expose a way to mutate the overview
      // ruler color once registered (the `options` setter only accepts
      // `overviewRulerOptions` and the runtime treats it as immutable at
      // 5.5). New markers created after a token flip will pick up the
      // new colors automatically via `getTokens()`. This call is kept on
      // the public surface so the live-tokens contract stays explicit.
      void _next
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      for (const entry of entries) {
        try {
          entry.decoration?.dispose()
        } catch {
          // already disposed
        }
        try {
          entry.marker.dispose()
        } catch {
          // already disposed
        }
      }
      entries.length = 0
      for (const d of disposables) {
        try {
          d.dispose()
        } catch {
          // already disposed
        }
      }
      disposables.length = 0
    },
  }
}
