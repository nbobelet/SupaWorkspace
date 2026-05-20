import { resolve, sep } from 'node:path'
import { ipcMain } from 'electron'
import {
  ExplorerListDirRequest,
  ExplorerOpenRequest,
  ExplorerReadFileRequest,
  ExplorerRevealRequest,
  ExplorerSearchCancelRequest,
  ExplorerSearchRequest,
  IpcChannel,
  type ExplorerListDirResponse,
  type ExplorerOpenResponse,
  type ExplorerReadFileResponse,
  type ExplorerSearchResponse,
} from '@shared/ipc'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'
import { listDir } from './list-dir'
import { readFile } from './read-file'
import { cancelSearch, search } from './search'
import { openPath, revealInFileManager } from './shell-actions'

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
    const result = await openPath(target)
    if (!result.opened && result.error) {
      console.warn(`[explorer] openPath failed for ${target}: ${result.error}`)
    }
    return { opened: result.opened }
  })

  ipcMain.handle(IpcChannel.ExplorerReadFile, async (_, raw): Promise<ExplorerReadFileResponse> => {
    const req = ExplorerReadFileRequest.parse(raw)
    const ws = workspaceStore.getById(req.workspaceId)
    if (!ws) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!ws.rootPath) {
      return { status: 'needs-grant', path: req.relPath }
    }
    return readFile(ws.rootPath, req.relPath, req.full ?? false)
  })

  ipcMain.handle(IpcChannel.ExplorerSearch, async (_, raw): Promise<ExplorerSearchResponse> => {
    const req = ExplorerSearchRequest.parse(raw)
    const ws = workspaceStore.getById(req.workspaceId)
    if (!ws) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    // Home (null rootPath) carries no scope to walk — same PathGrant contract
    // as the other explorer channels rather than an empty-but-ok result.
    if (!ws.rootPath) return { status: 'needs-grant', path: '' }
    const startedAt = Date.now()
    const result = await search(req.workspaceId, ws.rootPath, req.searchId)
    if (result.status === 'cancelled') {
      console.log(`[explorer] search "${req.query}" cancelled (id ${req.searchId})`)
      return { status: 'cancelled' }
    }
    console.log(
      `[explorer] search "${req.query}" -> ${result.hits.length} hits in ${Date.now() - startedAt}ms`,
    )
    return { status: 'ok', hits: result.hits, truncated: result.truncated }
  })

  ipcMain.handle(IpcChannel.ExplorerSearchCancel, async (_, raw): Promise<void> => {
    const req = ExplorerSearchCancelRequest.parse(raw)
    cancelSearch(req.workspaceId, req.searchId)
  })

  ipcMain.handle(IpcChannel.ExplorerReveal, async (_, raw): Promise<void> => {
    const req = ExplorerRevealRequest.parse(raw)
    const ws = workspaceStore.getById(req.workspaceId)
    if (!ws) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!ws.rootPath) return
    const target = clampToScope(ws.rootPath, req.relPath)
    if (target === null) return
    revealInFileManager(target)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.ExplorerListDir)
    ipcMain.removeHandler(IpcChannel.ExplorerOpen)
    ipcMain.removeHandler(IpcChannel.ExplorerReadFile)
    ipcMain.removeHandler(IpcChannel.ExplorerReveal)
    ipcMain.removeHandler(IpcChannel.ExplorerSearch)
    ipcMain.removeHandler(IpcChannel.ExplorerSearchCancel)
  }
}
