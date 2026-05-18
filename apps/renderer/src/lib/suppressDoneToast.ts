import type { NotificationPushEvent } from '@shared/notification'

// When the user is already looking at the session that just completed, an
// in-app "done" toast is noise — the terminal output already shows the
// command finished. Suppress the toast only in that exact case; everything
// else (other tabs, unfocused window, asking/error kinds) still toasts so
// the user isn't surprised.
export function shouldSuppressDoneToast(
  event: NotificationPushEvent,
  activeSessionId: string | null,
  windowFocused: boolean,
): boolean {
  if (event.kind !== 'request-complete') return false
  if (!event.sessionId) return false
  if (!windowFocused) return false
  return event.sessionId === activeSessionId
}
