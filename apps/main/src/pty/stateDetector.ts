import type { SessionState, SessionType } from '@shared/session'
import {
  detectUserInputRequired,
  isOsc133CommandStart,
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
  // Set true the first time a well-formed OSC 133;C/;D marker is seen. From
  // then on the command lifecycle (;C->running, ;D->idle) is authoritative
  // and the heuristic timers are off: `running` is latched between ;C and ;D
  // so output lulls never flap the state.
  integrated: boolean
  // True between ;C and ;D — a foreground command is currently executing.
  // Suppresses spurious `done` pulses (a watch/serve command keeps emitting
  // output that the Notifier mis-reads as request-complete).
  commandAlive: boolean
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
      integrated: false,
      commandAlive: false,
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

    // OSC 133 command-lifecycle markers are evaluated BEFORE the ANSI-noise
    // guard: shell integration emits them as pure escape sequences that strip
    // to empty, so the guard would otherwise swallow them. A well-formed
    // ;C/;D flips the session into `integrated` mode — from here the command
    // lifecycle is authoritative and the heuristic timers stay off.
    const sawDone = isOsc133Done(track.buffer)
    const sawCommandStart = isOsc133CommandStart(track.buffer)
    if (sawDone || sawCommandStart) track.integrated = true

    // ;D wins when both are present in the tail: it marks the END of the most
    // recent command, while a stale ;C may still linger in the rolling window.
    if (sawDone) {
      track.commandAlive = false
      if (track.state === 'running') {
        this.clearTimers(track)
        this.transition(sessionId, 'idle', 'osc133-done')
      }
      return
    }

    // ;C = command started. Latch `running` (no idle/fallback timer) until the
    // matching ;D — content-agnostic, so any long-running foreground command
    // stays running through every output lull.
    if (sawCommandStart) {
      track.commandAlive = true
      this.clearTimers(track)
      if (track.state !== 'running') {
        this.transition(sessionId, 'running', 'osc133-command-start')
      }
      return
    }

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

    if (detectUserInputRequired(track.buffer)) {
      this.clearTimers(track)
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

    // Sticky-done: while a `done` pulse is active, swallow data events.
    // Done is a transient visual cue that must survive UI repaints —
    // especially for claude TUI, where mid-pulse text bursts (background
    // status, "Thinking...", token counter) used to walk the FSM through
    // done -> running -> idle inside the 1500ms pulse, producing a visible
    // flap. The pulse ends naturally via doneTimer or via explicit signals
    // (onInput, onExit, asking detection above).
    if (track.state === 'done') return

    // Integrated sessions: data alone never auto-transitions. `running` is
    // latched between ;C and ;D, and `idle` is held while the prompt is shown
    // (so echoed keystrokes — visible text on the prompt line — never flip to
    // running). The heuristic timers below are for non-integrated shells and
    // claude only.
    if (track.integrated) return

    this.clearTimers(track)

    // claude is input-driven: data alone does NOT auto-transition
    // idle -> running. Claude's TUI emits constant background text
    // (model name, token counter, "thinking" indicator, status
    // repaints) that the old data-driven rule mistook for active turn
    // work — producing a ghost-running pulse without any command
    // actually executing. The authoritative "turn started" signal for
    // claude is user input (onInput) or the asking-cleared branch
    // (below, when a menu was dismissed). While ALREADY running, each
    // chunk still resets the fallback timer so streaming response text
    // doesn't prematurely settle to idle.
    if (track.type === 'claude' && track.state !== 'asking') {
      if (track.state === 'running') {
        track.fallbackTimer = setTimeout(() => {
          const cur = this.tracks.get(sessionId)
          if (!cur) return
          cur.fallbackTimer = null
          if (cur.state !== 'running') return
          this.transition(sessionId, 'idle', 'fallback-timer')
        }, FALLBACK_IDLE_MS[track.type])
      }
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

  // `data` is the raw bytes written to the pty. A command is only "submitted"
  // when it contains a carriage return / newline — plain keystrokes (editing
  // the command line) must NOT flip the session to `running`. `data` is
  // omitted by callers that mean an explicit submit (and by older tests), in
  // which case we treat it as a submit for back-compat.
  onInput(sessionId: string, data?: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return

    const isSubmit = data === undefined || /[\r\n]/.test(data)
    if (!isSubmit) return

    // Integrated shells get their authoritative `running` from ;C (emitted by
    // the shell right after the line is accepted). Don't pre-empt it here —
    // just clear any lingering done pulse so the next command starts clean.
    if (track.integrated) {
      track.buffer = ''
      this.clearDoneTimer(track)
      return
    }

    track.buffer = ''
    this.clearTimers(track)
    this.clearDoneTimer(track)
    this.transition(sessionId, 'running', 'user-input')
    // Arm the fallback so this running state can auto-settle to idle
    // even if no PTY data follows (silent input, hung session). Under
    // the claude input-driven model this is the only path that puts
    // claude into running, so without arming the fallback here a no-op
    // input would leave the session stuck on running forever. For shell
    // sessions, real command output normally resets this via onData
    // before it fires, so this is a defensive default.
    if (track.state !== 'running') return
    track.fallbackTimer = setTimeout(() => {
      const cur = this.tracks.get(sessionId)
      if (!cur) return
      cur.fallbackTimer = null
      if (cur.state !== 'running') return
      this.transition(sessionId, 'idle', 'fallback-timer')
    }, FALLBACK_IDLE_MS[track.type])
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    this.clearTimers(track)
    this.clearDoneTimer(track)
    track.commandAlive = false
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
    // Suppress the pulse while a foreground command is still alive (a ;C with
    // no matching ;D yet). A watch/serve command keeps producing output that
    // the Notifier mis-reads as request-complete; without this guard each
    // burst would flap the tab pill running -> done -> idle.
    if (track.commandAlive) return
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
