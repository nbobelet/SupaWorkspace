import { useSessionStore, type RendererSession } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useNotificationStore } from '../state/notificationStore'
import { focusSession } from '../hooks/useTerminalSession'
import { withViewTransition } from './viewTransition'

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
    // TerminalPane.useEffect([isActive]) takes the focus from here.
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

  // Wait for React to commit the new tab into the DOM before scrolling its
  // entry into view in the tab strip. Focus is owned by TerminalPane's
  // useEffect([isActive]) — the newly-active pane self-focuses once mounted.
  requestAnimationFrame(() => {
    const el = document.querySelector(`[data-session-id="${CSS.escape(session.id)}"]`)
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: scrollBehavior, inline: 'nearest', block: 'nearest' })
    }
  })
}

/**
 * Focus the xterm of `sessionId` on the next animation frame. Used by
 * `TerminalPane` when it mounts (or becomes active) so the user can type
 * immediately after a tab/workspace switch — no extra click needed.
 *
 * Owned by the pane itself so the focus call happens AFTER React has
 * committed the new tree and `useTerminalSession` has re-attached
 * `handle.element` to the DOM. Previous orchestration relied on a single
 * rAF in App.tsx / activateSession that could fire before the new pane's
 * `useEffect` ran, leaving `term.focus()` to target a detached textarea.
 *
 * Skips when an editable element outside xterm currently has focus, so
 * typing in a rename input / bug-report dialog / settings field is never
 * stolen by a re-render of the active pane.
 */
export function focusActiveSession(sessionId: string): void {
  if (isEditableNonXtermFocused()) return
  requestAnimationFrame(() => {
    if (isEditableNonXtermFocused()) return
    focusSession(sessionId)
  })
}

/**
 * Click-to-jump entry point for any "tab-like" surface that targets a session
 * (top SessionTabs strip, sidebar workspace-accordion session row, command
 * palette, notification toast Open action). Switches the active workspace
 * first when the session lives in a different one — without this guard,
 * setActive() flips the session-store activeId but the visible workspace
 * stays put, leaving the click on a hidden pane.
 *
 * Same-workspace clicks degrade to plain activateSession() so the
 * "click-the-active-pane preserves selection" contract still holds.
 */
export async function jumpToSession(sessionId: string): Promise<void> {
  const session = useSessionStore.getState().sessions[sessionId]
  if (!session) return
  const ws = useWorkspaceStore.getState()
  if (ws.activeWorkspaceId !== session.workspaceId) {
    withViewTransition(() => ws.setActiveWorkspace(session.workspaceId))
    useNotificationStore.getState().clearForWorkspace(session.workspaceId)
  }
  await activateSession(sessionId)
}

/**
 * Click-to-jump entry point for workspace-level tabs (sidebar tile). When the
 * workspace is already active, the React effect that re-activates the right
 * session on workspaceId change does NOT fire (no state diff), so the
 * terminal would stay unfocused — fall back to focusing the workspace's
 * remembered active session directly. The cross-workspace path defers focus
 * to the App.tsx workspace-switch effect (which picks the right session and
 * TerminalPane self-focuses on isActive flip).
 */
export function jumpToWorkspace(workspaceId: string): void {
  const ws = useWorkspaceStore.getState()
  if (ws.activeWorkspaceId !== workspaceId) {
    withViewTransition(() => ws.setActiveWorkspace(workspaceId))
    useNotificationStore.getState().clearForWorkspace(workspaceId)
    return
  }
  const sid = useSessionStore.getState().activeByWorkspace[workspaceId]
  if (sid) focusActiveSession(sid)
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
