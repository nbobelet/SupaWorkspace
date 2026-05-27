import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import type { SessionType } from '@shared/session'
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
 * A POSIX-absolute path ("/home/nico/proj"). On a Windows host this can NOT be
 * existsSync-checked — it lives inside the WSL distro, invisible to the Win32
 * fs — but `wsl.exe --cd` resolves it natively. So WSL sessions take such a
 * path verbatim instead of letting `usableDir` reject it and fall back to
 * homedir (which `--cd` would mount under /mnt/c). UNC paths (\\wsl.localhost\…)
 * are NOT handled here: those DO existsSync on Windows, so the normal chain
 * already accepts them.
 */
function isWslPath(path: string | null): path is string {
  return path != null && path.startsWith('/')
}

/**
 * Resolves the cwd a PTY should spawn in for a workspace. Single source of
 * truth (main-side only): `rootPath` (folder scope) wins, else `workdir`
 * (cwd hint, no scope), else the user's home directory as a validated, visible
 * fallback. The fallback is NOT a scope grant — scope lives only in
 * `rootPath` + `permissions.extraPaths` (see PermissionGate), so spawning in
 * homedir gives Home a place to start without widening its permission boundary.
 *
 * For `wsl` sessions a Linux `workdir` is an explicit cwd hint for the distro
 * and overrides a Windows `rootPath` (which `--cd` would otherwise mount under
 * /mnt/c); a Linux `rootPath` is honored too. These never widen the Windows-side
 * scope — that boundary does not cross into the distro (see resolveWslCommand).
 */
export function getEffectiveCwd(
  ws: Pick<Workspace, 'rootPath' | 'workdir'>,
  type?: SessionType,
): string {
  if (type === 'wsl') {
    if (isWslPath(ws.workdir)) return ws.workdir
    if (isWslPath(ws.rootPath)) return ws.rootPath
  }
  return usableDir(ws.rootPath) ?? usableDir(ws.workdir) ?? homedir()
}
