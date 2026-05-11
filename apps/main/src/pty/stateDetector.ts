import type { SessionState } from '@shared/session'
import { detectUserInputRequired } from '../notifications/detectUserInputRequired'

const RECENT_BUFFER_CAP = 4096

export interface StateDetectorEvents {
  onStateChange: (sessionId: string, state: SessionState) => void
}

interface SessionTrack {
  state: SessionState
  buffer: string
  hasReceivedData: boolean
}

export class StateDetector {
  private readonly tracks = new Map<string, SessionTrack>()

  constructor(private readonly events: StateDetectorEvents) {}

  register(sessionId: string): void {
    this.tracks.set(sessionId, {
      state: 'idle',
      buffer: '',
      hasReceivedData: false,
    })
    this.events.onStateChange(sessionId, 'idle')
  }

  unregister(sessionId: string): void {
    this.tracks.delete(sessionId)
  }

  onData(sessionId: string, data: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return

    track.hasReceivedData = true
    track.buffer = (track.buffer + data).slice(-RECENT_BUFFER_CAP)

    if (detectUserInputRequired(track.buffer)) {
      this.transition(sessionId, 'waiting-for-input')
    } else {
      this.transition(sessionId, 'running')
    }
  }

  onInput(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    track.buffer = ''
    this.transition(sessionId, 'running')
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    this.transition(sessionId, exitCode === 0 ? 'finished' : 'error')
  }

  getState(sessionId: string): SessionState | undefined {
    return this.tracks.get(sessionId)?.state
  }

  private transition(sessionId: string, next: SessionState): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.state === next) return
    track.state = next
    this.events.onStateChange(sessionId, next)
  }
}
