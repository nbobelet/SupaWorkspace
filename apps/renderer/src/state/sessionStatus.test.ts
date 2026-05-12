import { describe, expect, it } from 'vitest'
import { getSessionStatus, getStatusPriority, isUrgent } from './sessionStatus'

describe('getSessionStatus', () => {
  it('maps error to error', () => {
    expect(getSessionStatus('error')).toBe('error')
  })

  it('maps waiting-for-input to waiting', () => {
    expect(getSessionStatus('waiting-for-input')).toBe('waiting')
  })

  it('maps running to running', () => {
    expect(getSessionStatus('running')).toBe('running')
  })

  it('maps idle to idle', () => {
    expect(getSessionStatus('idle')).toBe('idle')
  })

  it('collapses finished into idle', () => {
    expect(getSessionStatus('finished')).toBe('idle')
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
