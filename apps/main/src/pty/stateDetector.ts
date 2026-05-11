import type { SessionState } from '@shared/session'

/* eslint-disable no-control-regex -- ESC byte required for OSC 133 prompt detection */
const WAITING_SENTINELS: RegExp[] = [
  /\bDo you want to allow\b/i,
  /\b\(y\/n\)\b/i,
  /\b\(yes\/no\)\b/i,
  /Press\s+(?:Enter|\[Enter\])\s+to/i,
  /\[y\/N\]/,
  /\[Y\/n\]/,
  /❯/,
  /\]133;[A-D]/,
]
/* eslint-enable no-control-regex */

const IDLE_AFTER_WRITE_MS = 800
const RECENT_BUFFER_CAP = 4096

export interface StateDetectorEvents {
  onStateChange: (sessionId: string, state: SessionState) => void
}

interface SessionTrack {
  state: SessionState
  buffer: string
  idleTimer: NodeJS.Timeout | null
  hasReceivedData: boolean
}

export class StateDetector {
  private readonly tracks = new Map<string, SessionTrack>()

  constructor(private readonly events: StateDetectorEvents) {}

  register(sessionId: string): void {
    this.tracks.set(sessionId, {
      state: 'idle',
      buffer: '',
      idleTimer: null,
      hasReceivedData: false,
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

    this.transition(sessionId, 'running')

    const matchesWaiting = WAITING_SENTINELS.some((re) => re.test(track.buffer))
    if (matchesWaiting) {
      this.scheduleIdleCheck(sessionId, () => {
        this.transition(sessionId, 'waiting-for-input')
      })
    } else {
      this.scheduleIdleCheck(sessionId, () => {
        this.transition(sessionId, 'running')
      })
    }
  }

  onInput(sessionId: string): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    track.buffer = ''
    if (track.idleTimer) clearTimeout(track.idleTimer)
    this.transition(sessionId, 'running')
  }

  onExit(sessionId: string, exitCode: number): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.idleTimer) clearTimeout(track.idleTimer)
    track.idleTimer = null
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

  private scheduleIdleCheck(sessionId: string, fn: () => void): void {
    const track = this.tracks.get(sessionId)
    if (!track) return
    if (track.idleTimer) clearTimeout(track.idleTimer)
    track.idleTimer = setTimeout(() => {
      track.idleTimer = null
      fn()
    }, IDLE_AFTER_WRITE_MS)
  }
}
