import { describe, it, expect } from 'vitest'
import { buildTheme } from './buildTheme'
import type { DesignTokens } from '../hooks/useDesignTokens'

const TOKENS: DesignTokens = {
  bg: '#0a0a0a',
  bgSunken: '#050505',
  bgElevated: '#141414',
  fg: '#e6e6e6',
  fgSubtle: '#b8b8b8',
  muted: '#888888',
  accent: '#4ade80',
  running: '#60a5fa',
  warn: '#fbbf24',
  error: '#f87171',
  border: '#262626',
  borderStrong: '#3a3a3a',
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

describe('buildTheme', () => {
  it('maps every ITheme field from design tokens', () => {
    const t = buildTheme(TOKENS)
    expect(t.background).toBe(TOKENS.bg)
    expect(t.foreground).toBe(TOKENS.fg)
    expect(t.cursor).toBe(TOKENS.accent)
    expect(t.cursorAccent).toBe(TOKENS.bg)
    expect(t.selectionForeground).toBe(TOKENS.fg)
    expect(t.red).toBe(TOKENS.error)
    expect(t.yellow).toBe(TOKENS.warn)
    expect(t.green).toBe(TOKENS.running)
    expect(t.black).toBe(TOKENS.ansiBlack)
    expect(t.blue).toBe(TOKENS.ansiBlue)
    expect(t.magenta).toBe(TOKENS.ansiMagenta)
    expect(t.cyan).toBe(TOKENS.ansiCyan)
    expect(t.white).toBe(TOKENS.ansiWhite)
    expect(t.brightBlack).toBe(TOKENS.ansiBrightBlack)
    expect(t.brightRed).toBe(TOKENS.ansiBrightRed)
    expect(t.brightGreen).toBe(TOKENS.ansiBrightGreen)
    expect(t.brightYellow).toBe(TOKENS.ansiBrightYellow)
    expect(t.brightBlue).toBe(TOKENS.ansiBrightBlue)
    expect(t.brightMagenta).toBe(TOKENS.ansiBrightMagenta)
    expect(t.brightCyan).toBe(TOKENS.ansiBrightCyan)
    expect(t.brightWhite).toBe(TOKENS.ansiBrightWhite)
  })

  it('composes selectionBackground at 30% alpha from tokens.accent', () => {
    const t = buildTheme(TOKENS)
    // #4ade80 -> rgb(74, 222, 128)
    expect(t.selectionBackground).toBe('rgba(74, 222, 128, 0.3)')
  })

  it('composes selectionInactiveBackground at 15% alpha from tokens.accent', () => {
    const t = buildTheme(TOKENS)
    expect(t.selectionInactiveBackground).toBe('rgba(74, 222, 128, 0.15)')
  })

  it('handles 3-digit hex accent', () => {
    const t = buildTheme({ ...TOKENS, accent: '#0f0' })
    // #0f0 -> #00ff00 -> rgb(0, 255, 0)
    expect(t.selectionBackground).toBe('rgba(0, 255, 0, 0.3)')
  })

  it('handles rgb() string accent', () => {
    const t = buildTheme({ ...TOKENS, accent: 'rgb(10, 20, 30)' })
    expect(t.selectionBackground).toBe('rgba(10, 20, 30, 0.3)')
  })

  it('is pure — same tokens produce equal output across calls', () => {
    const a = buildTheme(TOKENS)
    const b = buildTheme(TOKENS)
    expect(a).toEqual(b)
  })
})
