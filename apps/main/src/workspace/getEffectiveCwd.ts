import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import type { Workspace } from '@shared/workspace'

function usableDir(path: string | null): string | null {
  if (!path) return null
  try {
    return existsSync(path) && statSync(path).isDirectory() ? path : null
  } catch {
    return null
  }
}

/**
 * Resolves the cwd a PTY should spawn in for a workspace. Single source of
 * truth (main-side only): `rootPath` (folder scope) wins, else `workdir`
 * (cwd hint, no scope), else the user's home directory as a validated, visible
 * fallback. The fallback is NOT a scope grant — scope lives only in
 * `rootPath` + `permissions.extraPaths` (see PermissionGate), so spawning in
 * homedir gives Home a place to start without widening its permission boundary.
 */
export function getEffectiveCwd(ws: Pick<Workspace, 'rootPath' | 'workdir'>): string {
  return usableDir(ws.rootPath) ?? usableDir(ws.workdir) ?? homedir()
}
