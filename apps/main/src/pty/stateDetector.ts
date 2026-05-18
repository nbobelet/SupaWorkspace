import type { SessionState, SessionType } from '@shared/session'
import {
  detectUserInputRequired,
  isOsc133Done,
} from '../notifications/detectUserInputRequired'
import { detectIdlePrompt, stripAnsi } from '../notifications/detectIdlePrompt'
import { logTransition, type TransitionReason } from './stateDetectorDebug'

const RECENT_BUFFER_CAP = 4096
const IDLE_DEBOUNCE_MS = 400
// Hard fallback: even when no IDLE_PROMPT_PATTERNS regex matches, a long
// enough lull in PTY output means the session is no longer actively
// producing output. Per-type because shells stream bursty output during
// long builds (npm install, webpack) and a short fallback would flicker
// idle/running. Claude TUI never matches a prompt regex, so it needs the
// shorter fallback to feel responsive between render passes.
const FALLBACK_IDLE_MS: Record<SessionType, number> = {
  shell: 10000,
  claude: 2000,
}
// Visual pulse duration when Notifier flags a request-complete. Independent
// of MIN_RUNNING_MS_FOR_DONE (the gate to emit `done` in the first place);
// this constant times how long the `done` state lingers before auto-reverting
// to `idle`.
const DONE_DURATION_MS = 1500

// Legal transitions. Soft-asserted in `transition()` — illegal moves log a
// warning and skip, never throw (state machine must not crash the app).
const TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  idle: ['running', 'asking', 'done', 'ending'],
  running: ['idle', 'asking', 'done', 'ending'],
  // exit asking only via running (then debounce/fallback settles to idle)
  asking: ['running', 'ending'],
  done: ['idle', 'running', 'ending'],
  ending: [],
}

export interface StateDetectorEvents {
  onStateChange: (sessionId: string, state: SessionState, exitCode?: number | null) => void
}

interface SessionTrack {
  state: SessionState
  type: SessionType
  buffer: string
  hasReceivedData: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
  fallbackTimer: ReturnType<typeof setTimeout> | null
  doneTimer: ReturnType<typeof setTimeout> | null
  lastTransitionAt: number
}

export class StateDetector {
  private readonly tracks = new Map<string, SessionTrack>()

  constructor(private readonly events: StateDetectorEvents) {}

  register(sessionId: string, type: SessionType = 'shell'): void {
    this.tracks.set(sessionId, {
      state: 'idle',
      type,
      buffer: '',
      hasReceivedData: false,
      idleTimer: null,
      fallbackTimer: null,
      doneTimer: null,
      lastTransitionAt: Date.now(),
    })
    this.events.onStateChange(sessionId, 'idle', null)
  }

  unregister(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (track) {
      this.clearTimers(track)
      this.clearDoneTimer(track)
    }
    this.tracks.delete(sessionId)
  }

  onData(sessionId: string, data: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return

    track.hasReceivedData = true
    track.buffer = (track.buffer + data).slice(-RECENT_BUFFER_CAP)

    // ANSI-noise guard, applied in EVERY state. PSReadLine cursor-blink,
    // Claude TUI spinner / cursor-blink, OSC title repaints all emit pure
    // escape bursts that strip to empty. Skipping them keeps:
    //   - `idle` sticky (the tab pill doesn't flip back to running on
    //     PSReadLine repaints after a finished `sleep 3`);
    //   - `running` honest (Claude's continuous spinner/title repaints no
    //     longer reset the fallback idle timer, so the session can settle
    //     to `idle` and the `asking` transition can later fire — without
    //     this, the state machine was trapped in `running` forever and
    //     the "input needed" notification never reached the user);
    //   - `asking` sticky (cursor blinks on a selector menu don't drop
    //     the asking state).
    if (stripAnsi(data).trim() === '') {
      return
    }

    this.clearTimers(track)

    // Authoritative shell-emitted done marker (OSC 133;D). When present,
    // skip the debounce + fallback path entirely. The shell told us
    // explicitly that the command finished — trust it.
    if (isOsc133Done(track.buffer)) {
      if (track.state === 'running') {
        this.transition(sessionId, 'idle', 'osc133-done')
      }
      return
    }

    if (detectUserInputRequired(track.buffer)) {
      this.transition(sessionId, 'asking', 'regex-asking')
      // Reset the buffer once asking is confirmed. Subsequent chunks then
      // evaluate against a fresh window — a menu redraw (full re-render of
      // the asking frame) re-trips asking, while a screen wipe (plain text
      // replacing the menu) falls through to the asking-cleared branch.
      // Without this reset, the old menu would stay in the rolling tail
      // and asking would be sticky even after the menu is gone.
      track.buffer = ''
      return
    }

    // If we were asking and the buffer no longer matches an asking pattern
    // (menu dismissed, frame redrawn without prompt), drop to running so
    // the debounce/fallback can settle to idle. Without this, asking is
    // sticky except via onInput — closing a Claude menu with Esc leaves
    // the state stuck on `asking` until the user types something.
    const reason: TransitionReason = track.state === 'asking' ? 'asking-cleared' : 'regex-prompt'
    this.transition(sessionId, 'running', reason)

    track.idleTimer = setTimeout(() => {
      const cur = this.tracks.get(sessionId)
      if (!cur) return
      cur.idleTimer = null
      if (cur.state !== 'running') return
      if (detectIdlePrompt(cur.buffer)) {
        this.transition(sessionId, 'idle', 'idle-debounce')
      }
    }, IDLE_DEBOUNCE_MS)

    // Fallback: even when no IDLE_PROMPT_PATTERNS regex matches (Claude TUI,
    // unknown prompt formats, ...), a long enough lull after a `running`
    // burst is treated as idle. Cancelled by every new data event, so
    // streaming output never trips it.
    track.fallbackTimer = setTimeout(() => {
      const cur = this.tracks.get(sessionId)
      if (!cur) return
      cur.fallbackTimer = null
      if (cur.state !== 'running') return
      this.transition(sessionId, 'idle', 'fallback-timer')
    }, FALLBACK_IDLE_MS[track.type])
  }

  onInput(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    track.buffer = ''
    this.clearTimers(track)
    this.clearDoneTimer(track)
    this.transition(sessionId, 'running', 'user-input')
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    this.clearTimers(track)
    this.clearDoneTimer(track)
    track.state = 'ending'
    this.events.onStateChange(sessionId, 'ending', exitCode)
  }

  // Called by main process after Notifier emits `request-complete`. Promotes
  // the (already-idle, or still-running in rare races) track to `done` for
  // DONE_DURATION_MS before auto-reverting to `idle`. The renderer pulses
  // the tab pill on `done`. No-op from `asking` / `ending` / `done` — those
  // states shouldn't be overridden by a delayed request-complete signal.
  markDone(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.state !== 'running' && track.state !== 'idle') return
    this.clearDoneTimer(track)
    this.transition(sessionId, 'done', 'request-complete')
    track.doneTimer = setTimeout(() => {
      const cur = this.tracks.get(sessionId)
      if (!cur) return
      cur.doneTimer = null
      if (cur.state !== 'done') return
      this.transition(sessionId, 'idle', 'done-auto-revert')
    }, DONE_DURATION_MS)
  }

  private clearTimers(track: SessionTrack): void {
    if (track.idleTimer) {
      clearTimeout(track.idleTimer)
      track.idleTimer = null
    }
    if (track.fallbackTimer) {
      clearTimeout(track.fallbackTimer)
      track.fallbackTimer = null
    }
  }

  private clearDoneTimer(track: SessionTrack): void {
    if (track.doneTimer) {
      clearTimeout(track.doneTimer)
      track.doneTimer = null
    }
  }

  getState(sessionId: string): SessionState | undefined {
    return this.tracks.get(sessionId)?.state
  }

  private transition(sessionId: string, next: SessionState, reason: TransitionReason): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    // Cancel a pending done-pulse on ANY new transition (user activity,
    // exit, etc.). Done is meant to be a transient visual cue, not a
    // sticky state that survives unrelated activity.
    this.clearDoneTimer(track)
    if (track.state === next) return
    const prev = track.state
    if (!TRANSITIONS[prev].includes(next)) {
      console.warn(
        `[supat:state] illegal transition ${prev}->${next} (reason=${reason}, session=${sessionId}). Skipping.`,
      )
      return
    }
    const nowMs = Date.now()
    const deltaMs = nowMs - track.lastTransitionAt
    track.state = next
    track.lastTransitionAt = nowMs
    logTransition(sessionId, prev, next, deltaMs, reason)
    this.events.onStateChange(sessionId, next)
  }
}
