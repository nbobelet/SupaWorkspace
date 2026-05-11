import { useEffect, useRef } from 'react'
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
  dispose: () => void
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
    const handle = handles.get(sessionId)
    if (handle) {
      handle.dispose()
      handles.delete(sessionId)
    }
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

  const onUserInput = term.onData((data) => {
    void window.ws.session.write({ sessionId, data })
  })

  const dispose = (): void => {
    onUserInput.dispose()
    term.dispose()
  }

  const handle: TerminalHandle = { term, fit, dispose }
  handles.set(sessionId, handle)
  return handle
}

export function useTerminalSession(sessionId: string, container: HTMLElement | null): void {
  const openedRef = useRef(false)
  const webglRef = useRef<WebglAddon | null>(null)

  useEffect(() => {
    ensureGlobalListeners()
  }, [])

  useEffect(() => {
    if (!container) return
    const handle = getOrCreateHandle(sessionId)

    if (!openedRef.current) {
      handle.term.open(container)
      openedRef.current = true

      try {
        const webgl = new WebglAddon()
        handle.term.loadAddon(webgl)
        webglRef.current = webgl
      } catch (err) {
        console.warn('[xterm] WebGL renderer unavailable, falling back to canvas/dom:', err)
      }

      requestAnimationFrame(() => {
        try {
          handle.fit.fit()
          const { cols, rows } = handle.term
          void window.ws.session.resize({ sessionId, cols, rows })
        } catch {
          // container not measurable yet
        }
      })
    }

    const observer = new ResizeObserver(() => {
      try {
        handle.fit.fit()
        const { cols, rows } = handle.term
        void window.ws.session.resize({ sessionId, cols, rows })
      } catch {
        // container vanished
      }
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      if (webglRef.current) {
        webglRef.current.dispose()
        webglRef.current = null
      }
    }
  }, [sessionId, container])
}

export function disposeTerminal(sessionId: string): void {
  const handle = handles.get(sessionId)
  if (!handle) return
  handle.dispose()
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
