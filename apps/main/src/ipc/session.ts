import { ipcMain } from 'electron'
import {
  IpcChannel,
  SessionKillRequest,
  SessionResizeRequest,
  SessionSpawnRequest,
  SessionWriteRequest,
  type SessionSpawnResponse,
} from '@shared/ipc'
import type { SessionConfig } from '@shared/session'
import type { SessionManager } from '../pty/SessionManager'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'

export function registerSessionIpc(opts: {
  sessionManager: SessionManager
  workspaceStore: WorkspaceStore
  onSpawn?: (config: SessionConfig) => void
}): () => void {
  const { sessionManager, workspaceStore, onSpawn } = opts

  ipcMain.handle(IpcChannel.SessionSpawn, async (_, raw): Promise<SessionSpawnResponse> => {
    const req = SessionSpawnRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    const config = sessionManager.spawn({
      workspaceId: workspace.id,
      rootPath: workspace.rootPath,
      type: req.type,
      cols: req.cols,
      rows: req.rows,
      label: req.label,
    })
    onSpawn?.(config)
    return { sessionId: config.id, label: config.label }
  })

  ipcMain.handle(IpcChannel.SessionWrite, async (_, raw): Promise<void> => {
    const req = SessionWriteRequest.parse(raw)
    sessionManager.write(req.sessionId, req.data)
  })

  ipcMain.handle(IpcChannel.SessionResize, async (_, raw): Promise<void> => {
    const req = SessionResizeRequest.parse(raw)
    sessionManager.resize(req.sessionId, req.cols, req.rows)
  })

  ipcMain.handle(IpcChannel.SessionKill, async (_, raw): Promise<void> => {
    const req = SessionKillRequest.parse(raw)
    sessionManager.kill(req.sessionId)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.SessionSpawn)
    ipcMain.removeHandler(IpcChannel.SessionWrite)
    ipcMain.removeHandler(IpcChannel.SessionResize)
    ipcMain.removeHandler(IpcChannel.SessionKill)
  }
}
