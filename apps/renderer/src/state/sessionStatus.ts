import type { SessionState } from '@shared/session'

export type SessionStatus = 'idle' | 'running' | 'waiting' | 'error'

export function getSessionStatus(state: SessionState, exitCode?: number | null): SessionStatus {
  switch (state) {
    case 'asking':
      return 'waiting'
    case 'running':
      return 'running'
    case 'ending':
      return exitCode !== undefined && exitCode !== null && exitCode !== 0 ? 'error' : 'idle'
    case 'idle':
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
