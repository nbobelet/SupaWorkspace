import { useSessionStore } from '../state/sessionStore'
import { focusSession } from '../hooks/useTerminalSession'

// Single source of truth for "give focus back to the active xterm pane".
// Both SessionCommandBar (on submit/Escape) and useKeybindings (after
// navigation actions) must route through this helper so the xterm-always-
// focused invariant has one place to enforce it.
//
// Reads activeId from the store directly — never inspects document.activeElement.
// No-ops when no session is active (do NOT focus document.body — that would
// strand keystrokes nowhere).
export function returnFocusToActiveSession(): void {
  const activeId = useSessionStore.getState().activeId
  if (!activeId) return
  if (typeof requestAnimationFrame === 'undefined') {
    focusSession(activeId)
    return
  }
  requestAnimationFrame(() => focusSession(activeId))
}
