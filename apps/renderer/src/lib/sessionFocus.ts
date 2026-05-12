import { useSessionStore, type RendererSession } from '../state/sessionStore'
import { focusSession } from '../hooks/useTerminalSession'

/**
 * Spawn-focus invariant. Every user-initiated spawn path must call this helper
 * instead of `useSessionStore.addSession` directly:
 *
 *   1. The new session is registered in the store.
 *   2. It is made the active session for its workspace (overrides any prior
 *      active session — `addSession` alone only sets active when the workspace
 *      had none).
 *   3. After the next paint, xterm focuses the new instance and the tab is
 *      scrolled into view if the tab strip overflows.
 *
 * Snapshot restore on app boot must NOT use this helper — it would steal focus
 * mid-restore and animate scroll for every restored tab.
 */
export function addSessionWithFocus(session: RendererSession): void {
  const store = useSessionStore.getState()
  store.addSession(session)
  // `addSession` only sets active when no session is active yet — force it.
  store.setActive(session.id)

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const scrollBehavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth'

  // Wait for React to commit the new tab into the DOM before focusing / scrolling.
  requestAnimationFrame(() => {
    focusSession(session.id)
    const el = document.querySelector(`[data-session-id="${CSS.escape(session.id)}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: scrollBehavior, inline: 'nearest', block: 'nearest' })
    }
  })
}
