import type { SessionState } from '@shared/session'

const enabled = (process.env['DEBUG'] ?? '').split(',').includes('supat:state')

export type TransitionReason =
  | 'osc133-done'
  | 'osc133-command-start'
  | 'osc133-prompt'
  | 'regex-prompt'
  | 'regex-asking'
  | 'idle-debounce'
  | 'fallback-timer'
  | 'user-input'
  | 'exit-code'
  | 'asking-cleared'
  | 'done-auto-revert'
  | 'request-complete'

export function logTransition(
  sessionId: string,
  prev: SessionState,
  next: SessionState,
  deltaMs: number,
  reason?: TransitionReason,
): void {
  if (!enabled) return
  const reasonSuffix = reason ? ` (${reason})` : ''
  console.log(`[supat:state] ${sessionId} ${prev}->${next} +${deltaMs}ms${reasonSuffix}`)
}
