import type { SessionState } from '@shared/session'
import { detectUserInputRequired } from '../notifications/detectUserInputRequired'
import { detectIdlePrompt } from '../notifications/detectIdlePrompt'

const RECENT_BUFFER_CAP = 4096
const IDLE_DEBOUNCE_MS = 400

export interface StateDetectorEvents {
  onStateChange: (sessionId: string, state: SessionState, exitCode?: number | null) => void
}

interface SessionTrack {
  state: SessionState
  buffer: string
  hasReceivedData: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
}

export class StateDetector {
  private readonly tracks = new Map<string, SessionTrack>()

  constructor(private readonly events: StateDetectorEvents) {}

  register(sessionId: string): void {
    this.tracks.set(sessionId, {
      state: 'idle',
      buffer: '',
      hasReceivedData: false,
      idleTimer: null,
    })
    this.events.onStateChange(sessionId, 'idle', null)
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

    if (track.idleTimer) {
      clearTimeout(track.idleTimer)
      track.idleTimer = null
    }

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
  }

  onInput(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    track.buffer = ''
    if (track.idleTimer) {
      clearTimeout(track.idleTimer)
      track.idleTimer = null
    }
    this.transition(sessionId, 'running')
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.idleTimer) {
      clearTimeout(track.idleTimer)
      track.idleTimer = null
    }
    track.state = 'ending'
    this.events.onStateChange(sessionId, 'ending', exitCode)
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
