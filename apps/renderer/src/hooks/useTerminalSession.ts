import { useEffect } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'
import { useSessionStore } from '../state/sessionStore'

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

interface TerminalHandle {
  term: Terminal
  fit: FitAddon
  element: HTMLDivElement
  webgl: WebglAddon | null
  inputDisposable: { dispose: () => void }
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
    if (handle) handle.term.write(data)
  })

  globalExitUnsub = window.ws.session.onExit(({ sessionId }) => {
    useSessionStore.getState().removeSession(sessionId)
    disposeTerminal(sessionId)
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

  const handle: TerminalHandle = { term, fit, element, webgl, inputDisposable }
  handles.set(sessionId, handle)
  return handle
}

export function focusSession(sessionId: string): void {
  const handle = handles.get(sessionId)
  if (!handle) return
  handle.term.scrollToBottom()
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

    const fitAndReport = (): void => {
      try {
        handle.fit.fit()
        const { cols, rows } = handle.term
        void window.ws.session.resize({ sessionId, cols, rows })
      } catch {
        // container not measurable yet
      }
    }

    requestAnimationFrame(fitAndReport)

    const observer = new ResizeObserver(() => fitAndReport())
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
