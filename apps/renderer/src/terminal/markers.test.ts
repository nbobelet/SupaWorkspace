import { describe, expect, it, vi } from 'vitest'
import type { IDecoration, IDisposable, IMarker } from '@xterm/xterm'
import { createMarkerRegistry, type MarkerTerminal } from './markers'
import type { DesignTokens } from '../hooks/useDesignTokens'

const TOKENS: DesignTokens = {
  bg: '#0a0a0a',
  bgSunken: '#050505',
  bgElevated: '#141414',
  fg: '#e6e6e6',
  fgSubtle: '#b8b8b8',
  muted: '#888888',
  accent: '#4ade80',
  running: '#4ade80',
  warn: '#fbbf24',
  error: '#f87171',
  border: '#262626',
  borderStrong: '#404040',
  ansiBlack: '#0a0a0a',
  ansiRed: '#f87171',
  ansiGreen: '#4ade80',
  ansiYellow: '#fbbf24',
  ansiBlue: '#60a5fa',
  ansiMagenta: '#c084fc',
  ansiCyan: '#67e8f9',
  ansiWhite: '#e6e6e6',
  ansiBrightBlack: '#262626',
  ansiBrightRed: '#fca5a5',
  ansiBrightGreen: '#86efac',
  ansiBrightYellow: '#fde68a',
  ansiBrightBlue: '#93c5fd',
  ansiBrightMagenta: '#d8b4fe',
  ansiBrightCyan: '#a5f3fc',
  ansiBrightWhite: '#ffffff',
}

interface FakeTerminalState {
  lines: string[]
  cursorY: number
  lineFeedListeners: Array<() => void>
  cursorMoveListeners: Array<() => void>
  registerMarker: ReturnType<typeof vi.fn>
  registerDecoration: ReturnType<typeof vi.fn>
  decorationCalls: Array<{ color: string }>
}

function makeFakeTerminal(): { term: MarkerTerminal; state: FakeTerminalState } {
  let markerId = 0
  const state: FakeTerminalState = {
    lines: [],
    cursorY: 0,
    lineFeedListeners: [],
    cursorMoveListeners: [],
    registerMarker: vi.fn(),
    registerDecoration: vi.fn(),
    decorationCalls: [],
  }

  const term: MarkerTerminal = {
    cols: 80,
    buffer: {
      active: {
        get cursorY() {
          return state.cursorY
        },
        getLine(line: number) {
          const text = state.lines[line]
          if (text === undefined) return undefined
          return { translateToString: () => text }
        },
      },
    },
    registerMarker: state.registerMarker.mockImplementation((): IMarker => {
      markerId += 1
      return {
        id: markerId,
        line: state.cursorY,
        isDisposed: false,
        dispose: vi.fn(),
        onDispose: () => ({ dispose: vi.fn() }),
      } as unknown as IMarker
    }),
    registerDecoration: state.registerDecoration.mockImplementation(
      (opts: { overviewRulerOptions?: { color: string } }): IDecoration | undefined => {
        const color = opts.overviewRulerOptions?.color ?? ''
        state.decorationCalls.push({ color })
        return {
          dispose: vi.fn(),
          onDispose: () => ({ dispose: vi.fn() }),
          isDisposed: false,
        } as unknown as IDecoration
      },
    ),
    onLineFeed(listener: () => void): IDisposable {
      state.lineFeedListeners.push(listener)
      return { dispose: () => {} }
    },
    onCursorMove(listener: () => void): IDisposable {
      state.cursorMoveListeners.push(listener)
      return { dispose: () => {} }
    },
  }
  return { term, state }
}

function pushLine(state: FakeTerminalState, text: string): void {
  state.lines.push(text)
  state.cursorY = state.lines.length
  for (const fn of state.lineFeedListeners) fn()
}

function setPromptLine(state: FakeTerminalState, prompt: string): void {
  state.lines.push(prompt)
  state.cursorY = state.lines.length - 1
  for (const fn of state.cursorMoveListeners) fn()
}

describe('createMarkerRegistry', () => {
  it('registers an error marker on a matching line feed', () => {
    const { term, state } = makeFakeTerminal()
    const registry = createMarkerRegistry(term, () => TOKENS, 'session-1')

    pushLine(state, 'hello world')
    expect(state.decorationCalls).toHaveLength(0)

    pushLine(state, 'error: something exploded')
    expect(state.decorationCalls.length).toBeGreaterThanOrEqual(1)
    // The latest decoration's color should be the error token (normalized
    // to lowercase `#RRGGBB`).
    const last = state.decorationCalls[state.decorationCalls.length - 1]
    expect(last?.color.toLowerCase()).toBe(TOKENS.error.toLowerCase())

    registry.dispose()
  })

  it('detects exit status N lines as errors', () => {
    const { term, state } = makeFakeTerminal()
    const registry = createMarkerRegistry(term, () => TOKENS, 'session-2')

    pushLine(state, 'command finished, exit status 127')
    const last = state.decorationCalls[state.decorationCalls.length - 1]
    expect(last?.color.toLowerCase()).toBe(TOKENS.error.toLowerCase())

    registry.dispose()
  })

  it('registers a boundary marker (muted) when the cursor lands on a prompt line', () => {
    const { term, state } = makeFakeTerminal()
    const registry = createMarkerRegistry(term, () => TOKENS, 'session-3')

    // Simulate a previous command line then prompt reappearing.
    state.lines.push('finished work')
    setPromptLine(state, 'user@host:~$ ')

    const last = state.decorationCalls[state.decorationCalls.length - 1]
    expect(last?.color.toLowerCase()).toBe(TOKENS.muted.toLowerCase())

    registry.dispose()
  })

  it('bumps a boundary to warn color when the previous line contains ^C', () => {
    const { term, state } = makeFakeTerminal()
    const registry = createMarkerRegistry(term, () => TOKENS, 'session-4')

    state.lines.push('long-running-command^C')
    setPromptLine(state, 'user@host:~$ ')

    const last = state.decorationCalls[state.decorationCalls.length - 1]
    expect(last?.color.toLowerCase()).toBe(TOKENS.warn.toLowerCase())

    registry.dispose()
  })

  it('disposes every registered marker and decoration on dispose', () => {
    const { term, state } = makeFakeTerminal()
    const registry = createMarkerRegistry(term, () => TOKENS, 'session-5')

    pushLine(state, 'error: one')
    pushLine(state, 'error: two')
    pushLine(state, 'error: three')

    const decorationDisposes = state.registerDecoration.mock.results
      .map((r) => r.value as IDecoration | undefined)
      .filter((d): d is IDecoration => d !== undefined)
      .map((d) => d.dispose)
    const markerDisposes = state.registerMarker.mock.results
      .map((r) => r.value as IMarker)
      .map((m) => m.dispose)

    registry.dispose()

    for (const fn of decorationDisposes) expect(fn).toHaveBeenCalled()
    for (const fn of markerDisposes) expect(fn).toHaveBeenCalled()

    // Idempotent — second dispose must not re-fire anything.
    const calledBefore = decorationDisposes[0] && (decorationDisposes[0] as ReturnType<typeof vi.fn>).mock.calls.length
    registry.dispose()
    expect((decorationDisposes[0] as ReturnType<typeof vi.fn>).mock.calls.length).toBe(calledBefore)
  })

  it('searchDecorationOptions returns the active/warn + match/accent hex pair from tokens', () => {
    const { term } = makeFakeTerminal()
    const registry = createMarkerRegistry(term, () => TOKENS, 'session-6')
    const opts = registry.searchDecorationOptions()
    expect(opts.matchOverviewRuler.toLowerCase()).toBe(TOKENS.accent.toLowerCase())
    expect(opts.activeMatchColorOverviewRuler.toLowerCase()).toBe(TOKENS.warn.toLowerCase())
    expect(opts.matchBackground.toLowerCase().startsWith(TOKENS.accent.toLowerCase())).toBe(true)
    expect(opts.activeMatchBackground.toLowerCase().startsWith(TOKENS.warn.toLowerCase())).toBe(true)
    registry.dispose()
  })
})
