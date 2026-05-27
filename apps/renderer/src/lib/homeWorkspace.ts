import type { Workspace } from '@shared/workspace'
import { isHomeWorkspace } from '@shared/workspace'

/**
 * The permanent Home workspace cannot be deleted. Every other workspace can.
 * Single predicate so the sidebar context menu and any guard share one rule.
 */
export function isDeletableWorkspace(ws: Pick<Workspace, 'kind'>): boolean {
  return !isHomeWorkspace(ws)
}

/**
 * Home is pinned to the top of the sidebar; the remaining workspaces keep the
 * order they arrive in (the main store already sorts them most-recent-first).
 * Stable: at most one Home is expected, but extras (shouldn't happen) are kept.
 */
export function sortWorkspacesHomeFirst<T extends Pick<Workspace, 'kind'>>(workspaces: T[]): T[] {
  const home = workspaces.filter((w) => isHomeWorkspace(w))
  const rest = workspaces.filter((w) => !isHomeWorkspace(w))
  return [...home, ...rest]
}

/**
 * What to show under a workspace's name in the sidebar / tabs. An explicit
 * `workdir` override wins: it's what the user configured and where WSL sessions
 * spawn, so hiding it behind rootPath made a saved workdir look like a no-op.
 * Else the folder's rootPath; else a neutral "Global — no folder" label (Home
 * with no hint).
 */
export function effectiveCwdLabel(ws: Pick<Workspace, 'rootPath' | 'workdir'>): string {
  return ws.workdir ?? ws.rootPath ?? 'Global — no folder'
}
