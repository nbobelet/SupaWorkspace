import { useSessionStore, type RendererSession } from '../state/sessionStore'
import { focusSession } from '../hooks/useTerminalSession'

function isEditableNonXtermFocused(): boolean {
  if (typeof document === 'undefined') return false
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (active.closest('.xterm')) return false
  return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable
}

const pendingSpawns = new Set<string>()

/**
 * Activate a session by id. If the session is a snapshot placeholder
 * (`pendingSpawn = true`), spawn the PTY lazily, swap the placeholder id
 * for the real session id, then make it active. Real sessions are simply
 * set active and re-focused.
 */
export async function activateSession(id: string): Promise<void> {
  const store = useSessionStore.getState()
  const session = store.sessions[id]
  if (!session) return

  if (!session.pendingSpawn) {
    // Clicking the already-active pane must not re-focus through the
    // follow controller — resync() would call scrollToBottom() and wipe
    // any in-flight selection / scroll-back.
    if (store.activeId === id) return
    store.setActive(id)
    requestAnimationFrame(() => focusSession(id))
    return
  }

  if (pendingSpawns.has(id)) {
    store.setActive(id)
    return
  }
  pendingSpawns.add(id)
  // Show the placeholder as active immediately so the UI reflects the click.
  store.setActive(id)
  try {
    const res = await window.ws.session.spawn({
      workspaceId: session.workspaceId,
      type: session.type,
      cols: 80,
      rows: 24,
      label: session.label,
    })
    useSessionStore.getState().materializeSession(id, res.sessionId, res.label)
    requestAnimationFrame(() => focusSession(res.sessionId))
  } catch (err) {
    console.error('[session] lazy spawn failed', err)
  } finally {
    pendingSpawns.delete(id)
  }
}

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
export function addSessionWithFocus(
  session: Omit<RendererSession, 'badgeCount' | 'exitCode' | 'hasUnseenAsking' | 'hasUnseenEnding'> & {
    badgeCount?: number
    exitCode?: number | null
    hasUnseenAsking?: boolean
    hasUnseenEnding?: boolean
  },
): void {
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
    // Don't steal focus from an editable element the user is actively using
    // (e.g. the SessionCommandBar textarea). xterm's own canvas/textarea is
    // exempt — focus theft from xterm is intentional when spawning.
    if (!isEditableNonXtermFocused()) {
      focusSession(session.id)
    }
    const el = document.querySelector(`[data-session-id="${CSS.escape(session.id)}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: scrollBehavior, inline: 'nearest', block: 'nearest' })
    }
  })
}

/**
 * If the given workspace contains exactly one ready (non-pending) session,
 * focus its terminal on the next animation frame. No-op otherwise.
 *
 * Used to keep the cursor in the terminal whenever the workspace narrows
 * down to a single typeable session — workspace switch, tab close, app
 * startup. Skips when the user is actively typing in an editable element
 * outside xterm (same guard as `addSessionWithFocus`).
 */
export function focusIfSoleSession(workspaceId: string): void {
  const { sessions } = useSessionStore.getState()
  let soleId: string | null = null
  for (const id in sessions) {
    const s = sessions[id]
    if (!s || s.workspaceId !== workspaceId || s.pendingSpawn) continue
    if (soleId !== null) return
    soleId = id
  }
  if (soleId === null) return
  if (isEditableNonXtermFocused()) return
  const target = soleId
  requestAnimationFrame(() => {
    if (isEditableNonXtermFocused()) return
    focusSession(target)
  })
}
