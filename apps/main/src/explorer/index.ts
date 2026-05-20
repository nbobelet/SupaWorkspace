import { resolve, sep } from 'node:path'
import { ipcMain, shell } from 'electron'
import {
  ExplorerListDirRequest,
  ExplorerOpenRequest,
  ExplorerRevealRequest,
  IpcChannel,
  type ExplorerListDirResponse,
  type ExplorerOpenResponse,
} from '@shared/ipc'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'
import { listDir } from './list-dir'

/**
 * Clamp `relPath` to the workspace scope and return the absolute target, or
 * `null` when it escapes (`..`) or the workspace carries no rootPath (Home —
 * everything must be earned through a PathGrant, out of scope for v1).
 */
function clampToScope(rootPath: string, relPath: string): string | null {
  const base = resolve(rootPath)
  const target = resolve(base, relPath)
  if (target === base) return target
  const withSep = base.endsWith(sep) ? base : base + sep
  return target.startsWith(withSep) ? target : null
}

export function registerExplorerIpc(opts: { workspaceStore: WorkspaceStore }): () => void {
  const { workspaceStore } = opts

  ipcMain.handle(IpcChannel.ExplorerListDir, async (_, raw): Promise<ExplorerListDirResponse> => {
    const req = ExplorerListDirRequest.parse(raw)
    const ws = workspaceStore.getById(req.workspaceId)
    if (!ws) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!ws.rootPath) {
      return { status: 'needs-grant', path: req.relPath }
    }
    const result = await listDir(ws.rootPath, req.relPath)
    if (result.status === 'needs-grant') {
      return { status: 'needs-grant', path: result.path }
    }
    return { status: 'ok', relPath: result.relPath, entries: result.entries }
  })

  ipcMain.handle(IpcChannel.ExplorerOpen, async (_, raw): Promise<ExplorerOpenResponse> => {
    const req = ExplorerOpenRequest.parse(raw)
    const ws = workspaceStore.getById(req.workspaceId)
    if (!ws) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!ws.rootPath) return { opened: false }
    const target = clampToScope(ws.rootPath, req.relPath)
    if (target === null) return { opened: false }
    // shell.openPath returns '' on success, a non-empty error string otherwise.
    const error = await shell.openPath(target)
    if (error) console.warn(`[explorer] openPath failed for ${target}: ${error}`)
    return { opened: error === '' }
  })

  ipcMain.handle(IpcChannel.ExplorerReveal, async (_, raw): Promise<void> => {
    const req = ExplorerRevealRequest.parse(raw)
    const ws = workspaceStore.getById(req.workspaceId)
    if (!ws) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!ws.rootPath) return
    const target = clampToScope(ws.rootPath, req.relPath)
    if (target === null) return
    shell.showItemInFolder(target)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.ExplorerListDir)
    ipcMain.removeHandler(IpcChannel.ExplorerOpen)
    ipcMain.removeHandler(IpcChannel.ExplorerReveal)
  }
}
