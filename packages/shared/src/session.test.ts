import { describe, expect, it } from 'vitest'
import { SessionConfig, SessionState, SessionType } from './session'

describe('SessionType', () => {
  it('accepts claude and shell', () => {
    expect(SessionType.parse('claude')).toBe('claude')
    expect(SessionType.parse('shell')).toBe('shell')
  })

  it('rejects unknown types', () => {
    expect(() => SessionType.parse('python')).toThrow()
  })
})

describe('SessionState', () => {
  it('accepts every valid state', () => {
    for (const state of ['idle', 'running', 'asking', 'done', 'ending'] as const) {
      expect(SessionState.parse(state)).toBe(state)
    }
  })

  it('rejects retired states', () => {
    expect(() => SessionState.parse('waiting-for-input')).toThrow()
    expect(() => SessionState.parse('finished')).toThrow()
    expect(() => SessionState.parse('error')).toThrow()
  })
})

describe('SessionConfig', () => {
  it('round-trips a valid config', () => {
    const config = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      workspaceId: '550e8400-e29b-41d4-a716-446655440001',
      type: 'shell' as const,
      label: 'pwsh',
      cwd: 'C:/repo',
      createdAt: 1_700_000_000_000,
    }
    expect(SessionConfig.parse(config)).toEqual(config)
  })

  it('rejects non-uuid ids', () => {
    expect(() =>
      SessionConfig.parse({
        id: 'not-a-uuid',
        workspaceId: '550e8400-e29b-41d4-a716-446655440001',
        type: 'shell',
        label: 'x',
        cwd: '/',
        createdAt: 1,
      }),
    ).toThrow()
  })
})
