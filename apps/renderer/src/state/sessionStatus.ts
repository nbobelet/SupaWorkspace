import type { SessionState } from '@shared/session'

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'error'

export function getSessionStatus(state: SessionState): SessionStatus {
  switch (state) {
    case 'error':
      return 'error'
    case 'waiting-for-input':
      return 'waiting'
    case 'running':
      return 'running'
    case 'idle':
    case 'finished':
    default:
      return 'idle'
  }
}

const PRIORITY: Record<SessionStatus, number> = {
  error: 3,
  waiting: 2,
  running: 1,
  idle: 0,
}

export function getStatusPriority(status: SessionStatus): number {
  return PRIORITY[status]
}

export function isUrgent(status: SessionStatus): boolean {
  return status === 'error' || status === 'waiting'
}
