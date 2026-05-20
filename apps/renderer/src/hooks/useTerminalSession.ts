import { useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { FitAddon as FitAddonCtor } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { ProgressAddon } from '@xterm/addon-progress'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { toast } from 'sonner'
import '@xterm/xterm/css/xterm.css'
import { TerminalOptionsZ, type TerminalOptions } from '@shared/terminal/options'
import { useSessionStore } from '../state/sessionStore'
import { usePaneProgressStore, type ProgressEntry } from '../state/paneProgressStore'
import {
  createFollowController,
  shouldResyncAfterFit,
  type FollowController,
  type FollowOutputTarget,
} from '../lib/followOutput'
import { buildAddons, buildClipboardAddon } from '../terminal/buildAddons'
import { buildTheme } from '../terminal/buildTheme'
import { createMarkerRegistry, type MarkerRegistry } from '../terminal/markers'
import { readDesignTokens, useDesignTokens, type DesignTokens } from './useDesignTokens'
import { useSettings } from './useSettings'

// Module-load fail-fast validation of the constructor options. A malformed
// defaults object surfaces as a sonner toast and re-throws to abort module
// init — misconfig cannot silently propagate to terminal construction.
function parseDefaults(): TerminalOptions {
  try {
    return TerminalOptionsZ.parse({
      font: {
        family: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        size: 13,
        lineHeight: 1.2,
      },
      cursor: {
        style: 'bar',
        inactiveStyle: 'outline',
        blink: true,
      },
      scrollback: 5000,
      minimumContrastRatio: 4.5,
      customGlyphs: true,
      smoothScrollDuration: 125,
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    toast.error('Terminal misconfigured', { description: detail })
    throw err
  }
}

const DEFAULTS: TerminalOptions = parseDefaults()

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

interface TerminalHandle {
  term: Terminal
  fit: FitAddon
  search: SearchAddon | null
  element: HTMLDivElement
  webgl: WebglAddon | null
  progress: ProgressAddon | null
  progressDisposable: { dispose: () => void } | null
  clipboard: ClipboardAddon | null
  inputDisposable: { dispose: () => void }
  follow: FollowController
  markerRegistry: MarkerRegistry
  rafScheduled: boolean
  // Last cols/rows we forwarded to the main process. PaneMosaic's single
  // mode unmounts the inactive TerminalPane and remounts the active one on
  // every tab/workspace switch; the remount fires ResizeObserver even when
  // the layout slot kept the same dimensions. Without this guard each
  // switch would send a `pty.resize` → SIGWINCH → shell prompt redraw →
  // stateDetector flips to `running` and the status badge flickers (and
  // notifications fire).
  lastReportedSize: { cols: number; rows: number } | null
}

export function shouldReportResize(
  prev: { cols: number; rows: number } | null,
  next: { cols: number; rows: number },
): boolean {
  if (!prev) return true
  return prev.cols !== next.cols || prev.rows !== next.rows
}

// A `false -> true` visibility flip must force a fresh fit even when the
// container `contentRect` is unchanged. PaneMosaic single mode remounts the
// active pane into a slot of identical dimensions, so the ResizeObserver
// never re-fires; without a forced refit the first-paint crop persists. This
// only governs the local `fit()`/reflow — `shouldReportResize` still gates
// the `pty.resize` IPC, so an unchanged cols/rows stays silent.
export function shouldForceRefitOnVisibility(prev: boolean, next: boolean): boolean {
  return !prev && next
}

function toFollowTarget(term: Terminal): FollowOutputTarget {
  return {
    buffer: term.buffer,
    scrollToBottom: () => term.scrollToBottom(),
    onScroll: (cb) => term.onScroll(cb),
  }
}

const handles = new Map<string, TerminalHandle>()
let globalDataUnsub: (() => void) | null = null
let globalExitUnsub: (() => void) | null = null
let globalStateUnsub: (() => void) | null = null
let listenersInitialized = false

function ensureGlobalListeners(): void {
  if (listenersInitialized) return
  listenersInitialized = true

  globalDataUnsub = window.ws.session.onData(({ sessionId, data }) => {
    const handle = handles.get(sessionId)
    if (!handle) return
    handle.follow.beginWrite()
    handle.term.write(data, () => {
      handle.follow.onWrite()
    })
  })

  // PTY exit no longer auto-removes the session — the SessionState event
  // moves the tab to `ending` state with exitCode, and the tab stays around
  // so the user can review output / exit code. Explicit close paths
  // (closeSession helper, X button, $mod+w) remove + dispose the terminal.
  globalExitUnsub = window.ws.session.onExit(() => {
    // intentionally empty
  })

  globalStateUnsub = window.ws.session.onState(({ sessionId, state }) => {
    useSessionStore.getState().setState(sessionId, state)
  })
}

function getOrCreateHandle(sessionId: string): TerminalHandle {
  const existing = handles.get(sessionId)
  if (existing) return existing

  const reduce = prefersReducedMotion()
  const term = new Terminal({
    fontFamily: DEFAULTS.font.family,
    fontSize: DEFAULTS.font.size,
    lineHeight: DEFAULTS.font.lineHeight,
    scrollback: DEFAULTS.scrollback,
    cursorBlink: reduce ? false : DEFAULTS.cursor.blink,
    cursorStyle: DEFAULTS.cursor.style,
    cursorInactiveStyle: DEFAULTS.cursor.inactiveStyle,
    minimumContrastRatio: DEFAULTS.minimumContrastRatio,
    customGlyphs: DEFAULTS.customGlyphs,
    smoothScrollDuration: reduce ? 0 : DEFAULTS.smoothScrollDuration,
    allowProposedApi: true,
    // Width in pixels of the overview-ruler column rendered to the right
    // of the viewport. xterm 5.5 uses the `overviewRulerWidth` option
    // (number), not a nested `{ width }` object; the ruler is hidden when
    // unset. Required for `MarkerRegistry` decorations to surface.
    overviewRulerWidth: 10,
    theme: buildTheme(readDesignTokens()),
  })

  const element = document.createElement('div')
  element.style.width = '100%'
  element.style.height = '100%'
  element.dataset['sessionId'] = sessionId

  // `term.open` must run before WebGL — the GPU renderer needs a screen
  // element to attach to. We call it after addon construction but before
  // any addon that touches the DOM is activated; xterm tolerates loading
  // addons either side of `open`, but WebGL specifically needs an attached
  // screen, so we open *before* the addon loop.
  term.open(element)

  // Build all addons via the pure factory. Order is canonical (see
  // `buildAddons.ts` doc-comment). Image budgets come from the validated
  // `TerminalOptions`; clipboard policy is hot-reloaded by an effect
  // below once `useSettings()` resolves, so we keep the default policy
  // here at construction time.
  const addons = buildAddons({
    image: DEFAULTS.image,
  })
  let webgl: WebglAddon | null = null
  let fit: FitAddon | null = null
  let search: SearchAddon | null = null
  let progress: ProgressAddon | null = null
  let clipboard: ClipboardAddon | null = null

  for (const addon of addons) {
    try {
      term.loadAddon(addon)
      // Activate Unicode 15 grapheme handling as soon as its addon loads.
      if (addon.constructor.name === 'UnicodeGraphemesAddon') {
        term.unicode.activeVersion = '15-graphemes'
      }
      if (addon instanceof WebglAddon) {
        webgl = addon
      }
      if (addon instanceof FitAddonCtor) {
        fit = addon
      }
      if (addon instanceof SearchAddon) {
        search = addon
      }
      if (addon instanceof ProgressAddon) {
        progress = addon
      }
      if (addon instanceof ClipboardAddon) {
        clipboard = addon
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const addonName = addon.constructor.name
      toast.error(`xterm addon "${addonName}" failed to load`, {
        description: message,
      })
    }
  }

  // Mirror ProgressAddon's `onChange` events into the per-pane Zustand
  // atom so the header pill renders cheaply (subscribe-by-selector). The
  // disposable is held on the handle and released by `disposeTerminal`.
  let progressDisposable: { dispose: () => void } | null = null
  if (progress) {
    progressDisposable = progress.onChange((entry) => {
      const safeEntry: ProgressEntry = { state: entry.state, value: entry.value }
      usePaneProgressStore.getState().set(sessionId, safeEntry)
    })
  }

  // WebGL renderer can lose its context (driver reset, GPU hot-plug, tab
  // backgrounding under aggressive policies). Dispose the addon — xterm
  // falls back to its built-in DOM renderer automatically.
  if (webgl) {
    webgl.onContextLoss(() => {
      webgl?.dispose()
      const handle = handles.get(sessionId)
      if (handle) handle.webgl = null
    })
  }

  // FitAddon is the canonical last entry of `buildAddons()`. If it
  // failed to load (extremely unlikely — FitAddon has no DOM or GPU
  // dependency), construct a fresh one and load it eagerly so the
  // handle always has a usable fit reference.
  if (!fit) {
    fit = new FitAddonCtor()
    try {
      term.loadAddon(fit)
    } catch {
      // No fit possible — terminal stays at xterm's default size.
    }
  }

  const inputDisposable = term.onData((data) => {
    void window.ws.session.write({ sessionId, data })
  })

  const follow = createFollowController(toFollowTarget(term))

  // Per-session marker registry — scans newly-completed lines for errors,
  // detects prompt-reappear boundaries, and owns every IDecoration it
  // creates. Disposed in `disposeTerminal`. `readDesignTokens` is passed
  // as a live getter so new markers always pick up the freshest snapshot.
  const markerRegistry = createMarkerRegistry(term, readDesignTokens, sessionId)

  const handle: TerminalHandle = {
    term,
    fit,
    search,
    element,
    webgl,
    progress,
    progressDisposable,
    clipboard,
    inputDisposable,
    follow,
    markerRegistry,
    rafScheduled: false,
    lastReportedSize: null,
  }
  handles.set(sessionId, handle)
  return handle
}

/**
 * Public lookup for the per-session SearchAddon, used by the `SearchBar`
 * component without granting it access to the rest of the handle. Returns
 * null if the session has not been mounted yet, or if the addon failed to
 * load (xterm's addon-load path is best-effort — see `buildAddons`).
 */
export function getSearchAddon(sessionId: string): SearchAddon | null {
  return handles.get(sessionId)?.search ?? null
}

/**
 * Public lookup for the per-session MarkerRegistry, used by the SearchBar
 * to derive its search-decoration options from the live token snapshot.
 */
export function getMarkerRegistry(sessionId: string): MarkerRegistry | null {
  return handles.get(sessionId)?.markerRegistry ?? null
}

/**
 * Refocus the inner xterm helper textarea — used by the SearchBar's
 * Escape handler so typing immediately resumes in the terminal.
 */
export function focusTerminal(sessionId: string): void {
  handles.get(sessionId)?.term.focus()
}

/**
 * Returns the current text selection inside the terminal, or an empty string
 * when nothing is selected or the session is not yet mounted.
 */
export function getTerminalSelection(sessionId: string): string {
  return handles.get(sessionId)?.term.getSelection() ?? ''
}

/**
 * Writes text into the terminal's PTY input — mirrors the Ctrl+Shift+V
 * keybinding path. No-op when the session is not mounted.
 */
export function terminalPaste(sessionId: string, text: string): void {
  handles.get(sessionId)?.term.paste(text)
}

/**
 * Selects all content in the terminal viewport — equivalent to Ctrl+A in
 * a plain text view. No-op when the session is not mounted.
 */
export function terminalSelectAll(sessionId: string): void {
  handles.get(sessionId)?.term.selectAll()
}

function applyThemeToAll(tokens: DesignTokens): void {
  const theme = buildTheme(tokens)
  for (const handle of handles.values()) {
    handle.term.options.theme = theme
  }
}

function applyMotionPrefs(reduce: boolean): void {
  for (const handle of handles.values()) {
    handle.term.options.smoothScrollDuration = reduce ? 0 : DEFAULTS.smoothScrollDuration
    handle.term.options.cursorBlink = reduce ? false : DEFAULTS.cursor.blink
  }
}

export function focusSession(sessionId: string): void {
  const handle = handles.get(sessionId)
  if (!handle) return
  handle.follow.resync()
  handle.term.focus()
}

// Scroll-to-bottom on tab activate without stealing DOM focus. Paired with
// `focusActiveSession` in sessionFocus.ts: resync always fires on activate;
// focusSession only fires when no editable element outside xterm is focused.
export function resyncSession(sessionId: string): void {
  const handle = handles.get(sessionId)
  if (!handle) return
  handle.follow.resync()
}

function readTerminalBuffer(sessionId: string): string | null {
  const handle = handles.get(sessionId)
  if (!handle) return null
  const buf = handle.term.buffer.active
  const lines: string[] = []
  for (let i = 0; i < buf.length; i++) {
    const line = buf.getLine(i)
    if (line) lines.push(line.translateToString(true))
  }
  return lines.join('\n')
}

function readTerminalThemeBg(sessionId: string): string | null {
  const handle = handles.get(sessionId)
  if (!handle) return null
  const theme = handle.term.options.theme
  return theme?.background ?? null
}

if (typeof window !== 'undefined') {
  const dbg = window as unknown as {
    __readTerminal?: typeof readTerminalBuffer
    __readTerminalThemeBg?: typeof readTerminalThemeBg
  }
  dbg.__readTerminal = readTerminalBuffer
  dbg.__readTerminalThemeBg = readTerminalThemeBg
}

export function useTerminalSession(sessionId: string, container: HTMLElement | null): void {
  const tokens = useDesignTokens()
  const settings = useSettings()

  useEffect(() => {
    ensureGlobalListeners()
  }, [])

  // Hot-reload the ClipboardAddon when the user toggles `allowOscWrite`
  // or `allowOscRead`. Disposing + re-loading ONLY the ClipboardAddon is
  // safe — every other addon (WebGL, Search, Markers, Fit, ...) stays
  // mounted on the same Terminal instance, no flicker, no scrollback loss.
  useEffect(() => {
    if (!settings) return
    const handle = handles.get(sessionId)
    if (!handle) return
    if (handle.clipboard) {
      try {
        handle.clipboard.dispose()
      } catch {
        // already disposed
      }
    }
    const fresh = buildClipboardAddon({
      allowOscWrite: settings.clipboard.allowOscWrite,
      allowOscRead: settings.clipboard.allowOscRead,
    })
    try {
      handle.term.loadAddon(fresh)
      handle.clipboard = fresh
    } catch {
      // Loading shouldn't fail post-mount (the underlying parser hooks
      // are already activated by the original addon's `activate`). Even
      // if it does, the terminal stays usable — we just lose the new
      // policy until the next toggle. No remount is appropriate here.
      handle.clipboard = null
    }
  }, [sessionId, settings])

  // Live theme rebind: every time the design-token snapshot changes (CSS var
  // mutation, MutationObserver tick), repaint every live terminal's theme
  // in place — no remount.
  useEffect(() => {
    applyThemeToAll(tokens)
  }, [tokens])

  // Live `prefers-reduced-motion` binding: react to OS-level toggles, and
  // update smoothScrollDuration + cursorBlink on every live handle.
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    applyMotionPrefs(mql.matches)
    const handler = (event: MediaQueryListEvent): void => {
      applyMotionPrefs(event.matches)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  useEffect(() => {
    if (!container) return
    const handle = getOrCreateHandle(sessionId)

    container.appendChild(handle.element)

    let wasVisible = false
    let disposed = false
    let pendingRaf: number | null = null

    const cancelPendingRaf = (): void => {
      if (pendingRaf !== null) {
        cancelAnimationFrame(pendingRaf)
        pendingRaf = null
      }
      handle.rafScheduled = false
    }

    const fitAndReport = (visibleNow: boolean): void => {
      try {
        handle.fit.fit()
        const { cols, rows } = handle.term
        if (shouldReportResize(handle.lastReportedSize, { cols, rows })) {
          handle.lastReportedSize = { cols, rows }
          void window.ws.session.resize({ sessionId, cols, rows })
        }
        if (
          shouldResyncAfterFit({
            visibleNow,
            wasVisible,
            isFollowing: handle.follow.isFollowing(),
          })
        ) {
          handle.follow.resync()
        }
        wasVisible = visibleNow
      } catch {
        // container not measurable yet
      }
    }

    // Coalesce ResizeObserver bursts into a single fit per animation
    // frame. Without this, fast drags or layout settles can produce
    // dozens of `fit()` calls per second, each reflowing the terminal.
    let pendingVisibleNow = container.clientWidth > 0 && container.clientHeight > 0
    const scheduleFit = (visibleNow: boolean): void => {
      // why: a false->true visibility flip must force a refit even when the
      // ResizeObserver stays silent. PaneMosaic single mode remounts the
      // active pane into a slot of identical dimensions (unchanged
      // contentRect), so without this bypass the first-paint bottom-row crop
      // persists until a window resize / view switch. The lastReportedSize
      // guard inside fitAndReport still suppresses the pty.resize when
      // cols/rows are unchanged, so the forced refit emits no SIGWINCH.
      const force = shouldForceRefitOnVisibility(wasVisible, visibleNow)
      pendingVisibleNow = visibleNow
      if (handle.rafScheduled && !force) return
      if (force) cancelPendingRaf()
      handle.rafScheduled = true
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = null
        handle.rafScheduled = false
        if (disposed) return
        fitAndReport(pendingVisibleNow)
      })
    }

    // The first fit must run after the monospace font + WebGL glyph metrics
    // settle, otherwise term.rows is derived from fallback cell height and
    // the bottom row(s) get cropped ("fit avant open = bug"). Gate on
    // document.fonts.ready when available, then a double rAF so the fit lands
    // after the first paint when glyph box measurement is stable.
    const runInitialFit = (): void => {
      if (disposed) return
      pendingRaf = requestAnimationFrame(() => {
        pendingRaf = requestAnimationFrame(() => {
          pendingRaf = null
          if (disposed) return
          fitAndReport(pendingVisibleNow)
        })
      })
    }

    const fontsReady =
      typeof document !== 'undefined' ? document.fonts?.ready : undefined
    if (fontsReady) {
      void fontsReady.then(() => {
        if (disposed) return
        runInitialFit()
      })
    } else {
      runInitialFit()
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const rect = entry?.contentRect
      const visibleNow = rect ? rect.width > 0 && rect.height > 0 : container.clientWidth > 0 && container.clientHeight > 0
      scheduleFit(visibleNow)
    })
    observer.observe(container)

    return () => {
      disposed = true
      cancelPendingRaf()
      observer.disconnect()
      if (handle.element.parentNode === container) {
        container.removeChild(handle.element)
      }
    }
  }, [sessionId, container])
}

export function disposeTerminal(sessionId: string): void {
  const handle = handles.get(sessionId)
  if (!handle) return
  handle.follow.dispose()
  handle.inputDisposable.dispose()
  // Dispose marker registry BEFORE the terminal — registry's IDecorations
  // and IMarkers must release their xterm-side bookkeeping while the
  // terminal is still alive.
  try {
    handle.markerRegistry.dispose()
  } catch {
    // already disposed
  }
  // Release the ProgressAddon's `onChange` subscription. The addon itself
  // is owned by xterm — `term.dispose()` below tears it down for us.
  if (handle.progressDisposable) {
    try {
      handle.progressDisposable.dispose()
    } catch {
      // already disposed
    }
    handle.progressDisposable = null
  }
  // Drop the per-session progress entry so the pill doesn't outlive the
  // PTY whose state it described.
  usePaneProgressStore.getState().clear(sessionId)
  // WebGL may have already disposed itself on context loss — guard the
  // call so we don't double-dispose.
  if (handle.webgl) {
    try {
      handle.webgl.dispose()
    } catch {
      // already disposed
    }
    handle.webgl = null
  }
  handle.term.dispose()
  handle.element.remove()
  handles.delete(sessionId)
}

export function teardownTerminalListeners(): void {
  globalDataUnsub?.()
  globalExitUnsub?.()
  globalStateUnsub?.()
  globalDataUnsub = null
  globalExitUnsub = null
  globalStateUnsub = null
  listenersInitialized = false
}
