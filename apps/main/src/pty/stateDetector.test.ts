import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionState } from '@shared/session'
import { StateDetector } from './stateDetector'

function makeDetector(idleAfterMs = 500): {
  detector: StateDetector
  events: Array<{ id: string; state: SessionState }>
} {
  const events: Array<{ id: string; state: SessionState }> = []
  const detector = new StateDetector(
    { onStateChange: (id, state) => events.push({ id, state }) },
    idleAfterMs,
  )
  return { detector, events }
}

describe('StateDetector', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('emits idle on register', () => {
    const { detector, events } = makeDetector()
    detector.register('s1')
    expect(events).toEqual([{ id: 's1', state: 'idle' }])
  })

  it('transitions running -> idle after quiescence', () => {
    const { detector, events } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'ok\r\nPS C:\\> ')
    expect(detector.getState('s1')).toBe('running')

    vi.advanceTimersByTime(499)
    expect(detector.getState('s1')).toBe('running')

    vi.advanceTimersByTime(2)
    expect(detector.getState('s1')).toBe('idle')

    expect(events.map((e) => e.state)).toEqual(['idle', 'running', 'idle'])
  })

  it('resets quiescence timer on subsequent data', () => {
    const { detector } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'chunk1')
    vi.advanceTimersByTime(300)
    detector.onData('s1', 'chunk2')
    vi.advanceTimersByTime(300)
    expect(detector.getState('s1')).toBe('running')

    vi.advanceTimersByTime(300)
    expect(detector.getState('s1')).toBe('idle')
  })

  it('does not drop waiting-for-input to idle on timeout', () => {
    const { detector } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'continue? [y/N] ')
    expect(detector.getState('s1')).toBe('waiting-for-input')

    vi.advanceTimersByTime(2000)
    expect(detector.getState('s1')).toBe('waiting-for-input')
  })

  it('switches from waiting to running on user input and re-schedules idle', () => {
    const { detector } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'continue? [y/N] ')
    expect(detector.getState('s1')).toBe('waiting-for-input')

    detector.onInput('s1')
    expect(detector.getState('s1')).toBe('running')

    vi.advanceTimersByTime(600)
    expect(detector.getState('s1')).toBe('idle')
  })

  it('cancels timer on exit and emits finished/error', () => {
    const { detector, events } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'streaming')
    detector.onExit('s1', 0)
    expect(detector.getState('s1')).toBe('finished')

    vi.advanceTimersByTime(2000)
    expect(events.map((e) => e.state)).toEqual(['idle', 'running', 'finished'])
  })

  it('emits error on non-zero exit code', () => {
    const { detector } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'boom')
    detector.onExit('s1', 1)
    expect(detector.getState('s1')).toBe('error')
  })

  it('cleans up timer on unregister', () => {
    const { detector } = makeDetector(500)
    detector.register('s1')
    detector.onData('s1', 'chunk')
    detector.unregister('s1')
    vi.advanceTimersByTime(2000)
    expect(detector.getState('s1')).toBeUndefined()
  })
})
