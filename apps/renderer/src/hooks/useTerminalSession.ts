import { useEffect } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useSessionStore } from '../state/sessionStore'
import {
  createFollowController,
  type FollowController,
  type FollowOutputTarget,
} from '../lib/followOutput'

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

  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon())
  term.loadAddon(new SearchAddon())

  const element = document.createElement('div')
  element.style.width = '100%'
  element.style.height = '100%'
  element.dataset['sessionId'] = sessionId

  term.open(element)

  let webgl: WebglAddon | null = null
  try {
    webgl = new WebglAddon()
    term.loadAddon(webgl)
  } catch (err) {
    console.warn('[xterm] WebGL renderer unavailable, falling back:', err)
    webgl = null
  }

  const inputDisposable = term.onData((data) => {
    void window.ws.session.write({ sessionId, data })
  })

  const follow = createFollowController(toFollowTarget(term))

  const handle: TerminalHandle = { term, fit, element, webgl, inputDisposable, follow }
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

    requestAnimationFrame(() => fitAndReport(container.clientWidth > 0 && container.clientHeight > 0))

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      const rect = entry?.contentRect
      const visibleNow = rect ? rect.width > 0 && rect.height > 0 : container.clientWidth > 0 && container.clientHeight > 0
      fitAndReport(visibleNow)
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
  handle.webgl?.dispose()
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
