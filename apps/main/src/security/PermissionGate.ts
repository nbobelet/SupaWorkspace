import { resolve, sep } from 'node:path'
import type { Workspace } from '@shared/workspace'

export class PermissionGate {
  static check(workspace: Workspace, absolutePath: string, kind: 'read' | 'write' = 'read'): boolean {
    const target = resolve(absolutePath)
    // A null rootPath (Home) carries no implicit scope: every path must be
    // earned through an explicit PathGrant in `permissions.extraPaths`.
    if (workspace.rootPath !== null && this.isInside(workspace.rootPath, target)) return true
    return workspace.permissions.extraPaths.some((grant) => {
      if (!this.isInside(grant.path, target)) return false
      if (grant.kind === 'write') return true
      return kind === 'read'
    })
  }

  private static isInside(root: string, target: string): boolean {
    const rootResolved = resolve(root)
    if (target === rootResolved) return true
    const withSep = rootResolved.endsWith(sep) ? rootResolved : rootResolved + sep
    return target.startsWith(withSep)
  }
}
