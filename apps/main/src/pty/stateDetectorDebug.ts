import type { SessionState } from '@shared/session'

const enabled = (process.env['DEBUG'] ?? '').split(',').includes('supat:state')

export function logTransition(
  sessionId: string,
  prev: SessionState,
  next: SessionState,
  deltaMs: number,
): void {
  if (!enabled) return
  console.log(`[supat:state] ${sessionId} ${prev}->${next} +${deltaMs}ms`)
}
