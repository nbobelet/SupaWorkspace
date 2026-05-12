import { describe, expect, it } from 'vitest'
import { getSessionStatus, getStatusPriority, isUrgent } from './sessionStatus'

describe('getSessionStatus', () => {
  it('maps asking to waiting', () => {
    expect(getSessionStatus('asking')).toBe('waiting')
  })

  it('maps running to running', () => {
    expect(getSessionStatus('running')).toBe('running')
  })

  it('maps idle to idle', () => {
    expect(getSessionStatus('idle')).toBe('idle')
  })

  it('maps ending with exitCode 0 to idle', () => {
    expect(getSessionStatus('ending', 0)).toBe('idle')
  })

  it('maps ending with non-zero exitCode to error', () => {
    expect(getSessionStatus('ending', 1)).toBe('error')
    expect(getSessionStatus('ending', 130)).toBe('error')
  })

  it('maps ending without exitCode to idle (no signal to colour error)', () => {
    expect(getSessionStatus('ending')).toBe('idle')
    expect(getSessionStatus('ending', null)).toBe('idle')
  })
})

describe('getStatusPriority', () => {
  it('ranks error > waiting > running > idle', () => {
    const e = getStatusPriority('error')
    const w = getStatusPriority('waiting')
    const r = getStatusPriority('running')
    const i = getStatusPriority('idle')
    expect(e).toBeGreaterThan(w)
    expect(w).toBeGreaterThan(r)
    expect(r).toBeGreaterThan(i)
  })
})

describe('isUrgent', () => {
  it('flags error as urgent', () => {
    expect(isUrgent('error')).toBe(true)
  })

  it('flags waiting as urgent', () => {
    expect(isUrgent('waiting')).toBe(true)
  })

  it('does not flag running as urgent', () => {
    expect(isUrgent('running')).toBe(false)
  })

  it('does not flag idle as urgent', () => {
    expect(isUrgent('idle')).toBe(false)
  })
})
