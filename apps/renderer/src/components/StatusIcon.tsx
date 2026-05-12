import type { ReactElement } from 'react'
import { Circle, CircleAlert, CircleDashed, Loader2 } from 'lucide-react'
import type { SessionStatus } from '../state/sessionStatus'

interface StatusIconProps {
  status: SessionStatus
  size?: number
  className?: string
}

const LABEL: Record<SessionStatus, string> = {
  error: 'errored',
  waiting: 'waiting for input',
  running: 'running',
  idle: 'idle',
}

export function StatusIcon({ status, size = 12, className = '' }: StatusIconProps): ReactElement {
  const label = LABEL[status]
  const base = 'shrink-0'
  const cls = [base, className].filter(Boolean).join(' ')

  switch (status) {
    case 'error':
      return (
        <CircleAlert
          size={size}
          className={`${cls} text-error`}
          aria-label={label}
          role="img"
        />
      )
    case 'waiting':
      return (
        <CircleDashed
          size={size}
          className={`${cls} text-warn motion-safe:animate-pulse`}
          aria-label={label}
          role="img"
        />
      )
    case 'running':
      return (
        <Loader2
          size={size}
          className={`${cls} text-running motion-safe:animate-spin`}
          aria-label={label}
          role="img"
        />
      )
    case 'idle':
    default:
      return (
        <Circle
          size={size}
          className={`${cls} text-muted`}
          aria-label={label}
          role="img"
        />
      )
  }
}
