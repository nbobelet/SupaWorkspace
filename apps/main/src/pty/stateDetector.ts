import type { SessionState, SessionType } from '@shared/session'
import { detectUserInputRequired } from '../notifications/detectUserInputRequired'
import { detectIdlePrompt, stripAnsi } from '../notifications/detectIdlePrompt'
import { logTransition } from './stateDetectorDebug'

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
      lastTransitionAt: Date.now(),
    })
    this.events.onStateChange(sessionId, 'idle', null)
  }

  unregister(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (track?.idleTimer) clearTimeout(track.idleTimer)
    if (track?.fallbackTimer) clearTimeout(track.fallbackTimer)
    this.tracks.delete(sessionId)
  }

  onData(sessionId: string, data: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return

    track.hasReceivedData = true
    track.buffer = (track.buffer + data).slice(-RECENT_BUFFER_CAP)

    // Idle stickiness vs ANSI-noise bursts. PSReadLine cursor-blink /
    // predictive-IntelliSense / OSC title updates emit pure escape bursts
    // that decay to empty after stripAnsi. Without this guard, every
    // burst flips a freshly-idle shell back to `running`, which is why
    // the tab pill never settles after e.g. `sleep 3` even though the
    // "done" notification fired correctly.
    if (track.state === 'idle' && stripAnsi(data).trim() === '') {
      return
    }

    this.clearTimers(track)

    if (detectUserInputRequired(track.buffer)) {
      this.transition(sessionId, 'asking')
      return
    }

    this.transition(sessionId, 'running')

    track.idleTimer = setTimeout(() => {
      const cur = this.tracks.get(sessionId)
      if (!cur) return
      cur.idleTimer = null
      if (cur.state !== 'running') return
      if (detectIdlePrompt(cur.buffer)) {
        this.transition(sessionId, 'idle')
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
      this.transition(sessionId, 'idle')
    }, FALLBACK_IDLE_MS[track.type])
  }

  onInput(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    track.buffer = ''
    this.clearTimers(track)
    this.transition(sessionId, 'running')
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    this.clearTimers(track)
    track.state = 'ending'
    this.events.onStateChange(sessionId, 'ending', exitCode)
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

  getState(sessionId: string): SessionState | undefined {
    return this.tracks.get(sessionId)?.state
  }

  private transition(sessionId: string, next: SessionState): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.state === next) return
    const prev = track.state
    const nowMs = Date.now()
    const deltaMs = nowMs - track.lastTransitionAt
    track.state = next
    track.lastTransitionAt = nowMs
    logTransition(sessionId, prev, next, deltaMs)
    this.events.onStateChange(sessionId, next)
  }
}
