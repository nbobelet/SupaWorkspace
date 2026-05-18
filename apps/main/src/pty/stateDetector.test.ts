import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionState } from '@shared/session'
import { StateDetector } from './stateDetector'

const FIXTURE_DIR = join(__dirname, '..', '..', 'test', 'fixtures', 'pty')

interface ReplayChunk {
  delayMs: number
  hex: string
}

function loadJsonChunks(name: string): ReplayChunk[] {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8')) as ReplayChunk[]
}

function hexToString(hex: string): string {
  return Buffer.from(hex, 'hex').toString('utf8')
}

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

  // Regression: PowerShell + claude TUI sessions stayed stuck on `running`
  // forever because their prompt shapes don't match IDLE_PROMPT_PATTERNS
  // (PowerShell because of trailing ANSI escapes — fixed in stripAnsi —
  // and Claude because its full-screen TUI never settles on a shell prompt).
  // A per-type fallback debounce now transitions running -> idle after a
  // long enough lull, regardless of regex match.
  describe('fallback idle (no prompt match)', () => {
    it('claude session falls back to idle after 2s of no data', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', '\x1b[2J\x1b[1;1Hsome TUI render')
      expect(detector.getState('s1')).toBe('running')

      vi.advanceTimersByTime(500)
      expect(detector.getState('s1')).toBe('running')

      vi.advanceTimersByTime(2000)
      expect(detector.getState('s1')).toBe('idle')
    })

    it('shell session does NOT fall back to idle at 2s (avoids npm-install flicker)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'building module 42%')
      expect(detector.getState('s1')).toBe('running')

      vi.advanceTimersByTime(3000)
      expect(detector.getState('s1')).toBe('running')
    })

    it('shell session falls back to idle after the 10s long fallback', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'some exotic prompt that does not match any regex')
      expect(detector.getState('s1')).toBe('running')

      vi.advanceTimersByTime(11000)
      expect(detector.getState('s1')).toBe('idle')
    })

    it('new data resets the fallback timer (no flicker on bursty output)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'first chunk')
      vi.advanceTimersByTime(1500)
      expect(detector.getState('s1')).toBe('running')

      detector.onData('s1', 'second chunk')
      vi.advanceTimersByTime(1500)
      expect(detector.getState('s1')).toBe('running')

      vi.advanceTimersByTime(1000)
      expect(detector.getState('s1')).toBe('idle')
    })

    it('asking state is not overridden by the fallback timer', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'continue? [y/N] ')
      expect(detector.getState('s1')).toBe('asking')

      vi.advanceTimersByTime(15000)
      expect(detector.getState('s1')).toBe('asking')
    })
  })

  // Regression: after the session settled on a shell prompt and emitted
  // `idle`, PSReadLine (and similar) keep firing tiny ANSI-only bursts
  // (cursor-blink, color reset, OSC title update). Each burst was flipping
  // the state back to `running` and the tab pill never settled — even
  // though the "done" notification had correctly fired during the brief
  // `idle` window. ANSI-only bursts must NOT disturb the idle state.
  describe('idle stickiness vs ANSI-noise bursts', () => {
    it('CSI-only burst after idle does not flip back to running', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'PS C:\\repo> ')
      vi.advanceTimersByTime(500)
      expect(detector.getState('s1')).toBe('idle')

      detector.onData('s1', '\x1b[?25h')
      expect(detector.getState('s1')).toBe('idle')

      detector.onData('s1', '\x1b[K\x1b[1G')
      expect(detector.getState('s1')).toBe('idle')
    })

    it('OSC-only title-update burst after idle does not flip back to running', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'PS C:\\repo> ')
      vi.advanceTimersByTime(500)
      expect(detector.getState('s1')).toBe('idle')

      detector.onData('s1', '\x1b]0;PowerShell\x07')
      expect(detector.getState('s1')).toBe('idle')
    })

    it('whitespace-only burst after idle does not flip back to running', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'PS C:\\repo> ')
      vi.advanceTimersByTime(500)
      expect(detector.getState('s1')).toBe('idle')

      detector.onData('s1', '   \r\n')
      expect(detector.getState('s1')).toBe('idle')
    })

    it('meaningful burst after idle still flips back to running', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'PS C:\\repo> ')
      vi.advanceTimersByTime(500)
      expect(detector.getState('s1')).toBe('idle')

      detector.onData('s1', 'building module 42%')
      expect(detector.getState('s1')).toBe('running')
    })

    it('ANSI-only burst while still running is unaffected (still running)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onData('s1', 'compiling...')
      expect(detector.getState('s1')).toBe('running')

      detector.onData('s1', '\x1b[?25h')
      expect(detector.getState('s1')).toBe('running')
    })
  })

  // Regression replay: pwsh `sleep 3` finishes and prints its next prompt
  // (`\r\nPS C:\>`). The detector must transition through running and
  // settle back to idle within the IDLE_DEBOUNCE_MS window.
  describe('pwsh sleep-3 fixture replay', () => {
    it('stabilizes to idle after the prompt redraw chunk', () => {
      const chunks = loadJsonChunks('pwsh-sleep-3.json')
      const { detector } = makeDetector()
      detector.register('s1', 'shell')

      // First chunk: command echo. Detector sees data → running.
      const first = chunks[0]
      if (!first) throw new Error('fixture missing first chunk')
      detector.onData('s1', hexToString(first.hex))
      expect(detector.getState('s1')).toBe('running')

      // Sleep gap. State stays running (no data).
      vi.advanceTimersByTime(first.delayMs > 0 ? first.delayMs : 0)
      const second = chunks[1]
      if (!second) throw new Error('fixture missing second chunk')
      vi.advanceTimersByTime(second.delayMs)
      expect(detector.getState('s1')).toBe('running')

      // Prompt redraw chunk arrives. Still running until idle debounce fires.
      detector.onData('s1', hexToString(second.hex))
      expect(detector.getState('s1')).toBe('running')

      vi.advanceTimersByTime(500)
      expect(detector.getState('s1')).toBe('idle')
    })
  })

  // Regression replay: claude TUI permission frame loaded from fixture
  // must trigger `asking` even though the "Do you want" line is wrapped
  // by box-drawing chars and trailing lines (the single-line anchor on
  // USER_INPUT_PATTERNS never matches it on its own).
  describe('claude TUI asking fixture replay', () => {
    it('transitions to asking when the permission frame is fed in', () => {
      const frame = readFileSync(join(FIXTURE_DIR, 'claude-asking-permission.bin'), 'utf8')
      const { detector } = makeDetector()
      detector.register('s1', 'claude')

      detector.onData('s1', frame)
      expect(detector.getState('s1')).toBe('asking')
    })
  })
})
