import { useEffect } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import type { FitAddon } from '@xterm/addon-fit'
import { FitAddon as FitAddonCtor } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { toast } from 'sonner'
import '@xterm/xterm/css/xterm.css'
import { useSessionStore } from '../state/sessionStore'
import {
  createFollowController,
  type FollowController,
  type FollowOutputTarget,
} from '../lib/followOutput'
import { buildAddons } from '../terminal/buildAddons'

const SCROLLBACK = 5000

const xtermTheme: ITheme = {
  background: '#0a0a0a',
  foreground: '#e6e6e6',
  cursor: '#4ade80',
  cursorAccent: '#0a0a0a',
  selectionBackground: '#3a3a3a',
  black: '#0a0a0a',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#67e8f9',
  white: '#e6e6e6',
  brightBlack: '#262626',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#a5f3fc',
  brightWhite: '#ffffff',
}

const SCROLLBAR_STYLE_ID = 'supa-xterm-scrollbar'
const SCROLLBAR_CSS = `
.xterm .xterm-viewport::-webkit-scrollbar { width: 8px; height: 8px; }
.xterm .xterm-viewport::-webkit-scrollbar-track { background: transparent; }
.xterm .xterm-viewport::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  transition: background-color 120ms ease;
}
.xterm .xterm-viewport:hover::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.18); }
.xterm .xterm-viewport::-webkit-scrollbar-thumb:active { background: rgba(255, 255, 255, 0.28); }
@media (prefers-reduced-motion: reduce) {
  .xterm .xterm-viewport::-webkit-scrollbar-thumb { transition: none; }
}
`

function ensureScrollbarStyles(): void {
  if (typeof document === 'undefined') return
  if (document.getElementById(SCROLLBAR_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SCROLLBAR_STYLE_ID
  style.textContent = SCROLLBAR_CSS
  document.head.appendChild(style)
}

interface TerminalHandle {
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  webgl: WebglAddon | null
  inputDisposable: { dispose: () => void }
  follow: FollowController
  rafScheduled: boolean
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

  ensureScrollbarStyles()

  globalDataUnsub = window.ws.session.onData(({ sessionId, data }) => {
    const handle = handles.get(sessionId)
    if (!handle) return
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

  const term = new Terminal({
    fontFamily: 'JetBrains Mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    scrollback: SCROLLBACK,
    cursorBlink: true,
    cursorStyle: 'bar',
    allowProposedApi: true,
    theme: xtermTheme,
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
  // `buildAddons.ts` doc-comment).
  const addons = buildAddons()
  let webgl: WebglAddon | null = null
  let fit: FitAddon | null = null

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
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const addonName = addon.constructor.name
      toast.error(`xterm addon "${addonName}" failed to load`, {
        description: message,
      })
    }
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

  const handle: TerminalHandle = {
    term,
    fit,
    element,
    webgl,
    inputDisposable,
    follow,
    rafScheduled: false,
  }
  handles.set(sessionId, handle)
  return handle
}

export function focusSession(sessionId: string): void {
  const handle = handles.get(sessionId)
  if (!handle) return
  handle.follow.resync()
  handle.term.focus()
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

if (typeof window !== 'undefined') {
  ;(window as unknown as { __readTerminal?: typeof readTerminalBuffer }).__readTerminal = readTerminalBuffer
}

export function useTerminalSession(sessionId: string, container: HTMLElement | null): void {
  useEffect(() => {
    ensureGlobalListeners()
  }, [])

  useEffect(() => {
    if (!container) return
    const handle = getOrCreateHandle(sessionId)

    container.appendChild(handle.element)

    let wasVisible = false

    const fitAndReport = (visibleNow: boolean): void => {
      try {
        handle.fit.fit()
        const { cols, rows } = handle.term
        void window.ws.session.resize({ sessionId, cols, rows })
        if (visibleNow && !wasVisible) {
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
      pendingVisibleNow = visibleNow
      if (handle.rafScheduled) return
      handle.rafScheduled = true
      requestAnimationFrame(() => {
        handle.rafScheduled = false
        fitAndReport(pendingVisibleNow)
      })
    }

    scheduleFit(pendingVisibleNow)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const rect = entry?.contentRect
      const visibleNow = rect ? rect.width > 0 && rect.height > 0 : container.clientWidth > 0 && container.clientHeight > 0
      scheduleFit(visibleNow)
    })
    observer.observe(container)

    return () => {
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
