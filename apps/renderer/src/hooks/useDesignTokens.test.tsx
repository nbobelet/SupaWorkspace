// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readDesignTokens, useDesignTokens, type DesignTokens } from './useDesignTokens'

// Flag React's act() environment so unhandled-effect warnings stay silent.
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const TOKEN_VARS: Record<string, string> = {
  '--color-bg': '#0a0a0a',
  '--color-bg-sunken': '#050505',
  '--color-bg-elevated': '#141414',
  '--color-fg': '#e6e6e6',
  '--color-fg-subtle': '#b8b8b8',
  '--color-muted': '#888888',
  '--color-accent': '#4ade80',
  '--color-running': '#60a5fa',
  '--color-warn': '#fbbf24',
  '--color-error': '#f87171',
  '--color-border': '#262626',
  '--color-border-strong': '#3a3a3a',
  '--ansi-black': '#0a0a0a',
  '--ansi-red': '#f87171',
  '--ansi-green': '#4ade80',
  '--ansi-yellow': '#fbbf24',
  '--ansi-blue': '#60a5fa',
  '--ansi-magenta': '#c084fc',
  '--ansi-cyan': '#67e8f9',
  '--ansi-white': '#e6e6e6',
  '--ansi-bright-black': '#262626',
  '--ansi-bright-red': '#fca5a5',
  '--ansi-bright-green': '#86efac',
  '--ansi-bright-yellow': '#fde68a',
  '--ansi-bright-blue': '#93c5fd',
  '--ansi-bright-magenta': '#d8b4fe',
  '--ansi-bright-cyan': '#a5f3fc',
  '--ansi-bright-white': '#ffffff',
}

function seedTokens(): void {
  for (const [name, value] of Object.entries(TOKEN_VARS)) {
    document.documentElement.style.setProperty(name, value)
  }
}

function clearTokens(): void {
  for (const name of Object.keys(TOKEN_VARS)) {
    document.documentElement.style.removeProperty(name)
  }
}

describe('readDesignTokens', () => {
  beforeEach(() => seedTokens())
  afterEach(() => clearTokens())

  it('reads every semantic and ANSI token from :root', () => {
    const t = readDesignTokens()
    expect(t.bg).toBe('#0a0a0a')
    expect(t.fg).toBe('#e6e6e6')
    expect(t.accent).toBe('#4ade80')
    expect(t.running).toBe('#60a5fa')
    expect(t.warn).toBe('#fbbf24')
    expect(t.error).toBe('#f87171')
    expect(t.border).toBe('#262626')
    expect(t.borderStrong).toBe('#3a3a3a')
    expect(t.ansiBlue).toBe('#60a5fa')
    expect(t.ansiBrightWhite).toBe('#ffffff')
  })

  it('returns trimmed strings (no leading whitespace from CSS spec)', () => {
    document.documentElement.style.setProperty('--color-bg', '  #112233  ')
    const t = readDesignTokens()
    expect(t.bg).toBe('#112233')
  })
})

describe('useDesignTokens', () => {
  let container: HTMLDivElement
  let root: Root
  let captured: DesignTokens | null = null

  beforeEach(() => {
    seedTokens()
    captured = null
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    clearTokens()
  })

  function Probe(): null {
    const tokens = useDesignTokens()
    captured = tokens
    return null
  }

  it('returns the initial token snapshot on mount', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    expect(captured).not.toBeNull()
    expect(captured?.bg).toBe('#0a0a0a')
    expect(captured?.accent).toBe('#4ade80')
  })

  it('re-emits when documentElement attributes mutate', async () => {
    await act(async () => {
      root.render(<Probe />)
    })
    const before = captured
    expect(before?.bg).toBe('#0a0a0a')

    // Mutate a CSS custom property — MutationObserver on attributes fires
    // because inline `style` is an attribute on documentElement.
    await act(async () => {
      document.documentElement.style.setProperty('--color-bg', '#112233')
      // Give the microtask queue a tick so the MutationObserver callback runs.
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(captured?.bg).toBe('#112233')
    expect(captured).not.toBe(before)
  })
})
