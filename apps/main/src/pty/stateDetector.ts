import type { SessionState } from '@shared/session'
import { detectUserInputRequired } from '../notifications/detectUserInputRequired'

const RECENT_BUFFER_CAP = 4096
const IDLE_AFTER_QUIESCENCE_MS = 500

export interface StateDetectorEvents {
  onStateChange: (sessionId: string, state: SessionState) => void
}

interface SessionTrack {
  state: SessionState
  buffer: string
  hasReceivedData: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
}

export class StateDetector {
  private readonly tracks = new Map<string, SessionTrack>()

  constructor(
    private readonly events: StateDetectorEvents,
    private readonly idleAfterMs: number = IDLE_AFTER_QUIESCENCE_MS,
  ) {}

  register(sessionId: string): void {
    this.tracks.set(sessionId, {
      state: 'idle',
      buffer: '',
      hasReceivedData: false,
      idleTimer: null,
    })
    this.events.onStateChange(sessionId, 'idle')
  }

  unregister(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (track?.idleTimer) clearTimeout(track.idleTimer)
    this.tracks.delete(sessionId)
  }

  onData(sessionId: string, data: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return

    track.hasReceivedData = true
    track.buffer = (track.buffer + data).slice(-RECENT_BUFFER_CAP)

    if (detectUserInputRequired(track.buffer)) {
      this.cancelIdleTimer(track)
      this.transition(sessionId, 'waiting-for-input')
    } else {
      this.transition(sessionId, 'running')
      this.scheduleIdle(sessionId, track)
    }
  }

  onInput(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    track.buffer = ''
    this.cancelIdleTimer(track)
    this.transition(sessionId, 'running')
    this.scheduleIdle(sessionId, track)
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    this.cancelIdleTimer(track)
    this.transition(sessionId, exitCode === 0 ? 'finished' : 'error')
  }

  getState(sessionId: string): SessionState | undefined {
    return this.tracks.get(sessionId)?.state
  }

  private scheduleIdle(sessionId: string, track: SessionTrack): void {
    this.cancelIdleTimer(track)
    track.idleTimer = setTimeout(() => {
      const t = this.tracks.get(sessionId)
      if (!t) return
      t.idleTimer = null
      if (t.state === 'running') {
        this.transition(sessionId, 'idle')
      }
    }, this.idleAfterMs)
  }

  private cancelIdleTimer(track: SessionTrack): void {
    if (track.idleTimer) {
      clearTimeout(track.idleTimer)
      track.idleTimer = null
    }
  }

  private transition(sessionId: string, next: SessionState): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.state === next) return
    track.state = next
    this.events.onStateChange(sessionId, next)
  }
}
