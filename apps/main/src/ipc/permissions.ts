import { resolve } from 'node:path'
import { dialog, ipcMain, BrowserWindow } from 'electron'
import {
  IpcChannel,
  PermissionsRequestPathRequest,
  PermissionsRevokePathRequest,
  type PermissionsRequestPathResponse,
} from '@shared/ipc'
import type { PathGrant, Workspace } from '@shared/workspace'
import { PermissionGate } from '../security/PermissionGate'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'

export function registerPermissionsIpc(opts: {
  workspaceStore: WorkspaceStore
  getMainWindow: () => BrowserWindow | null
}): () => void {
  const { workspaceStore, getMainWindow } = opts

  ipcMain.handle(
    IpcChannel.PermissionsRequestPath,
    async (_, raw): Promise<PermissionsRequestPathResponse> => {
      const req = PermissionsRequestPathRequest.parse(raw)
      const workspace = workspaceStore.getById(req.workspaceId)
      if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
      const absolutePath = resolve(req.path)

      if (PermissionGate.check(workspace, absolutePath, req.kind)) {
        return {
          granted: true,
          alwaysAllow: false,
          grant: null,
        }
      }

      const win = getMainWindow()
      const buttons = ['Deny', 'Allow once', 'Always allow']
      const dialogOpts = {
        type: 'question' as const,
        title: 'Out-of-scope access requested',
        message: `Session in "${workspace.name}" wants to ${req.kind} a file outside the workspace.`,
        detail: absolutePath,
        buttons,
        defaultId: 0,
        cancelId: 0,
        normalizeAccessKeys: true,
      }
      const result = win
        ? await dialog.showMessageBox(win, dialogOpts)
        : await dialog.showMessageBox(dialogOpts)

      if (result.response === 0) {
        return { granted: false, alwaysAllow: false, grant: null }
      }

      const alwaysAllow = result.response === 2
      const grant: PathGrant = {
        path: absolutePath,
        kind: req.kind,
        grantedAt: Date.now(),
      }
      if (alwaysAllow) {
        workspaceStore.addPathGrant(workspace.id, grant)
      }
      return { granted: true, alwaysAllow, grant }
    },
  )

  ipcMain.handle(IpcChannel.PermissionsRevokePath, async (_, raw): Promise<Workspace> => {
    const req = PermissionsRevokePathRequest.parse(raw)
    return workspaceStore.revokePathGrant(req.workspaceId, req.path)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.PermissionsRequestPath)
    ipcMain.removeHandler(IpcChannel.PermissionsRevokePath)
  }
}
