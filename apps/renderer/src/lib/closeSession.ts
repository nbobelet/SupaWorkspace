import { useSessionStore } from '../state/sessionStore'
import { disposeTerminal } from '../hooks/useTerminalSession'
import { withViewTransition } from './viewTransition'

// Single entry point for "user wants this tab gone".
//
// Removes the session from the store, disposes its xterm instance, and — if
// the PTY is still alive — signals it to exit. Idempotent; safe to call on
// already-ended sessions.
//
// We do NOT auto-remove sessions on natural PTY exit (see
// useTerminalSession.ts onExit handler) so the `ending` state stays visible
// for the user. Use this helper from the X button, $mod+w, palette close,
// and tab context menu.
export function closeSession(sessionId: string): void {
  const session = useSessionStore.getState().sessions[sessionId]
  // Placeholder tabs (snapshot-restored, not yet spawned) have no PTY in the
  // main process — skip the kill IPC to avoid "unknown session" errors.
  if (session && session.state !== 'ending' && !session.pendingSpawn) {
    void window.ws.session.kill({ sessionId })
  }
  withViewTransition(() => useSessionStore.getState().removeSession(sessionId))
  disposeTerminal(sessionId)
}
