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

    // Regression: Claude TUI emits constant cursor-blink / spinner / OSC
    // title repaints that have empty stripAnsi tails. Before the fix the
    // running-state ANSI-noise guard only applied to `idle`, so each burst
    // reset the fallback idle timer and the Claude session stayed `running`
    // forever even after Claude finished its turn — the asking notification
    // never fired because the state machine never transitioned out of
    // `running` in the first place.
    it('spinner bursts during running do NOT reset the fallback idle timer', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'Real Claude content')
      expect(detector.getState('s1')).toBe('running')

      // Simulate Claude TUI cursor-blink every 250ms during the 2s fallback
      // window. Each burst is pure ANSI noise (hide+show cursor).
      for (let i = 0; i < 8; i++) {
        vi.advanceTimersByTime(250)
        detector.onData('s1', '\x1b[?25l\x1b[?25h')
      }
      // 2s elapsed in 250ms increments. Fallback (2000ms after the only
      // meaningful chunk) should have fired exactly once during the loop.
      expect(detector.getState('s1')).toBe('idle')
    })

    it('OSC-title repaints during running do NOT reset the fallback idle timer', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'Real Claude content')

      // Title repaints arrive every 400ms (mimicking xterm title hooks).
      for (let i = 0; i < 6; i++) {
        vi.advanceTimersByTime(400)
        detector.onData('s1', '\x1b]0;claude — thinking\x07')
      }
      expect(detector.getState('s1')).toBe('idle')
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

  // Regression: when Claude's permission menu is dismissed (Esc, or Claude
  // redraws the frame without `❯` / "Do you want"), the next meaningful
  // chunk must drop the session out of `asking`. Before the fix, `asking`
  // was sticky except via onInput — closing the menu left the state stuck
  // until the user typed something unrelated.
  describe('asking → idle when buffer no longer matches', () => {
    it('drops to running then settles to idle after the menu is gone', () => {
      const frame = readFileSync(join(FIXTURE_DIR, 'claude-asking-permission.bin'), 'utf8')
      const { detector } = makeDetector()
      detector.register('s1', 'claude')

      detector.onData('s1', frame)
      expect(detector.getState('s1')).toBe('asking')

      // Menu dismissed: a plain Claude output chunk arrives, no asking pattern.
      detector.onData('s1', 'Continuing task without asking\n')
      expect(detector.getState('s1')).toBe('running')

      // Claude fallback (2s) should settle to idle.
      vi.advanceTimersByTime(2000)
      expect(detector.getState('s1')).toBe('idle')
    })
  })

  // Regression: OSC 133;D ("command done") is the authoritative shell signal
  // that the foreground command finished. When present, the detector must
  // shortcut running → idle without waiting for the debounce or fallback
  // timer. Before the fix, all OSC 133 codes (A/B/C/D) were misrouted to
  // `asking` via a single unanchored regex.
  describe('OSC 133;D done marker', () => {
    it('shortcuts running → idle immediately (no debounce wait)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')

      detector.onData('s1', 'building project...\r\n')
      expect(detector.getState('s1')).toBe('running')

      // OSC 133;D arrives. State should flip to idle on the same data event,
      // not after IDLE_DEBOUNCE_MS or FALLBACK_IDLE_MS.shell (10s).
      detector.onData('s1', 'done\r\n\x1b]133;D\x07')
      expect(detector.getState('s1')).toBe('idle')
    })

    it('does NOT flip to asking on a malformed 133;A burst (no valid terminator)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')

      // The anchored regex requires `A` to be terminated by `;`, BEL, ST, or
      // end-of-tail. A bare letter after `A` (here `B`) is none of those —
      // simulates a truncated / malformed escape that the OLD unanchored
      // regex would have falsely matched as asking.
      detector.onData('s1', 'streaming output here \x1b]133;ABCDE more text')
      expect(detector.getState('s1')).toBe('running')
    })
  })

  // Regression: `done` is a discrete state that fires when Notifier signals
  // request-complete. Auto-reverts to idle after DONE_DURATION_MS (1500ms).
  // Cancelled on any new transition (user activity, exit, etc.) to prevent
  // timer leaks.
  describe('done state + auto-revert', () => {
    it('markDone transitions idle → done → idle after 1500ms', () => {
      const { detector, events } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'finished a turn')
      vi.advanceTimersByTime(2000)
      expect(detector.getState('s1')).toBe('idle')

      detector.markDone('s1')
      expect(detector.getState('s1')).toBe('done')

      vi.advanceTimersByTime(1500)
      expect(detector.getState('s1')).toBe('idle')

      const lastTwo = events.slice(-2).map((e) => e.state)
      expect(lastTwo).toEqual(['done', 'idle'])
    })

    it('cancels pending done auto-revert when new activity arrives', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'turn finished')
      vi.advanceTimersByTime(2000)
      expect(detector.getState('s1')).toBe('idle')

      detector.markDone('s1')
      expect(detector.getState('s1')).toBe('done')

      // User types: onInput must clear the done timer AND transition to running.
      detector.onInput('s1')
      expect(detector.getState('s1')).toBe('running')

      // Even past the original 1500ms window, no done-auto-revert should fire.
      vi.advanceTimersByTime(1500)
      expect(detector.getState('s1')).toBe('running')
    })

    it('markDone is a no-op from asking (asking takes priority)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'continue? [y/N] ')
      expect(detector.getState('s1')).toBe('asking')

      detector.markDone('s1')
      expect(detector.getState('s1')).toBe('asking')
    })

    it('markDone is a no-op after exit (ending is terminal)', () => {
      const { detector } = makeDetector()
      detector.register('s1', 'shell')
      detector.onExit('s1', 0)
      expect(detector.getState('s1')).toBe('ending')

      detector.markDone('s1')
      expect(detector.getState('s1')).toBe('ending')
    })

    it('unregister clears the done timer (no leak)', () => {
      const { detector, events } = makeDetector()
      detector.register('s1', 'claude')
      detector.onData('s1', 'work')
      vi.advanceTimersByTime(2000)
      detector.markDone('s1')
      expect(detector.getState('s1')).toBe('done')

      detector.unregister('s1')
      vi.advanceTimersByTime(2000)

      // Track is gone — auto-revert callback no-ops. No phantom events emitted.
      const afterUnregister = events.filter((e) => e.state === 'idle').length
      // Only the initial register emit + the post-onData settle should count;
      // the would-be done-auto-revert must not have fired.
      expect(afterUnregister).toBe(2)
    })
  })

  // Regression: the soft transition-graph assertion. Illegal moves must log
  // a warning and skip (never throw — the state machine must not crash the
  // app). Documented because future contributors might be tempted to harden
  // this into a throw.
  describe('transition graph soft assertion', () => {
    it('skips an illegal transition without throwing', () => {
      const { detector, events } = makeDetector()
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
      detector.register('s1', 'shell')
      detector.onExit('s1', 0)
      expect(detector.getState('s1')).toBe('ending')

      // ending → done is NOT in TRANSITIONS[ending] (terminal state).
      // markDone from ending is a no-op at the markDone level, so this
      // test calls onInput AFTER ending to exercise the assertion path.
      detector.onInput('s1')
      expect(detector.getState('s1')).toBe('ending')
      expect(warn).toHaveBeenCalled()
      expect(events[events.length - 1]?.state).toBe('ending')
      warn.mockRestore()
    })
  })
})
