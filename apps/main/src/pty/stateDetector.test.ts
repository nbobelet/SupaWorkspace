import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionState } from '@shared/session'
import { StateDetector } from './stateDetector'

interface EventRecord {
  id: string
  state: SessionState
  exitCode?: number | null
}

function makeDetector(): {
  detector: StateDetector
  events: EventRecord[]
} {
  const events: EventRecord[] = []
  const detector = new StateDetector({
    onStateChange: (id, state, exitCode) => events.push({ id, state, exitCode }),
  })
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
    expect(events).toEqual([{ id: 's1', state: 'idle', exitCode: null }])
  })

  it('transitions to running on data without prompt match', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'compiling...\r\n')
    expect(detector.getState('s1')).toBe('running')
  })

  it('debounces back to idle when buffer settles on a shell prompt', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'ok\r\nPS C:\\repo> ')
    expect(detector.getState('s1')).toBe('running')

    vi.advanceTimersByTime(500)
    expect(detector.getState('s1')).toBe('idle')
  })

  it('stays running when buffer ends mid-output (no prompt match)', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'progress... 42%')
    expect(detector.getState('s1')).toBe('running')

    vi.advanceTimersByTime(500)
    expect(detector.getState('s1')).toBe('running')
  })

  it('transitions to asking on user-input prompt and stays there over time', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'continue? [y/N] ')
    expect(detector.getState('s1')).toBe('asking')

    vi.advanceTimersByTime(60_000)
    expect(detector.getState('s1')).toBe('asking')
  })

  it('switches from asking to running on user input', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'continue? [y/N] ')
    expect(detector.getState('s1')).toBe('asking')

    detector.onInput('s1')
    expect(detector.getState('s1')).toBe('running')
  })

  it('transitions to ending with exitCode=0 on clean exit', () => {
    const { detector, events } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'streaming')
    detector.onExit('s1', 0)
    expect(detector.getState('s1')).toBe('ending')
    const last = events[events.length - 1]
    expect(last?.state).toBe('ending')
    expect(last?.exitCode).toBe(0)
  })

  it('transitions to ending with non-zero exitCode on error exit', () => {
    const { detector, events } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'boom')
    detector.onExit('s1', 1)
    expect(detector.getState('s1')).toBe('ending')
    const last = events[events.length - 1]
    expect(last?.exitCode).toBe(1)
  })

  it('clears pending idle timer on exit', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'done\r\nPS C:\\> ')
    expect(detector.getState('s1')).toBe('running')
    detector.onExit('s1', 0)
    expect(detector.getState('s1')).toBe('ending')

    vi.advanceTimersByTime(1000)
    expect(detector.getState('s1')).toBe('ending')
  })

  it('cleans up on unregister', () => {
    const { detector } = makeDetector()
    detector.register('s1')
    detector.onData('s1', 'chunk')
    detector.unregister('s1')
    expect(detector.getState('s1')).toBeUndefined()
  })
})
