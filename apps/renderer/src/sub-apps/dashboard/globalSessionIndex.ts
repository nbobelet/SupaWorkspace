import type { SessionType } from '@shared/session'
import type { Workspace } from '@shared/workspace'
import { sortWorkspacesHomeFirst } from '../../lib/homeWorkspace'
import type { RendererSession } from '../../state/sessionStore'
import { getSessionStatus, type SessionStatus } from '../../state/sessionStatus'

/**
 * One row of the Home dashboard's global session overview. Identifies a live
 * session by its workspace rather than its own label: the user navigates the
 * whole app from Home, so "{Workspace} : TTY#{n}" is the meaningful handle.
 */
export interface GlobalSessionRow {
  sessionId: string
  workspaceId: string
  workspaceName: string
  /** Workspace color hue (0–360) for the row dot, or null when unset. */
  hue: number | null
  /** 1-based ordinal of this session within its workspace, following `order`. */
  ttyOrdinal: number
  /** Display handle, e.g. "SupaNotes : TTY#1". */
  label: string
  type: SessionType
  status: SessionStatus
}

/**
 * Derive the cross-workspace session list shown on the Home dashboard.
 *
 * Pure: no store access, no IPC. The TTY ordinal is assigned per workspace by
 * walking `order` (the global session order) so a workspace's sessions read
 * TTY#1, TTY#2, … in the same sequence the tab strip uses. Rows are then
 * grouped Home-first (via `sortWorkspacesHomeFirst`) and kept ordinal-ascending
 * within each workspace. Sessions whose workspace is unknown are skipped.
 */
export function buildGlobalSessionIndex(
  sessions: Record<string, RendererSession>,
  order: string[],
  workspaces: Workspace[],
): GlobalSessionRow[] {
  const wsById = new Map(workspaces.map((w) => [w.id, w]))
  const wsRank = new Map(sortWorkspacesHomeFirst(workspaces).map((w, i) => [w.id, i]))
  const ordinals = new Map<string, number>()

  const rows: GlobalSessionRow[] = []
  for (const id of order) {
    const session = sessions[id]
    if (!session) continue
    const ws = wsById.get(session.workspaceId)
    if (!ws) continue
    const ttyOrdinal = (ordinals.get(session.workspaceId) ?? 0) + 1
    ordinals.set(session.workspaceId, ttyOrdinal)
    rows.push({
      sessionId: session.id,
      workspaceId: session.workspaceId,
      workspaceName: ws.name,
      hue: ws.color?.hue ?? null,
      ttyOrdinal,
      label: `${ws.name} : TTY#${ttyOrdinal}`,
      type: session.type,
      status: getSessionStatus(session.state, session.exitCode),
    })
  }

  rows.sort((a, b) => {
    const ra = wsRank.get(a.workspaceId) ?? Number.MAX_SAFE_INTEGER
    const rb = wsRank.get(b.workspaceId) ?? Number.MAX_SAFE_INTEGER
    return ra !== rb ? ra - rb : a.ttyOrdinal - b.ttyOrdinal
  })
  return rows
}

/** Distinct workspaces represented in the row set — the "across M workspaces" count. */
export function countWorkspacesWithSessions(rows: GlobalSessionRow[]): number {
  return new Set(rows.map((r) => r.workspaceId)).size
}
