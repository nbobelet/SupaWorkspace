import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  SessionSnapshotClearResponse,
  SessionSnapshotListResponse,
} from '@shared/snapshot'
import type { SupaTTYStore } from '../supatty/SupaTTYStore'

/**
 * Bridges the legacy `session-snapshot:*` IPC channels onto the new
 * SupaTTY storage. The renderer still consumes the flat
 * `{ workspaceId, type, label }[]` envelope; renaming the channels is a
 * follow-up iteration that also touches preload + renderer.
 */
export function registerSessionSnapshotIpc(opts: {
  supattyStore: SupaTTYStore
}): () => void {
  const { supattyStore } = opts

  ipcMain.handle(
    IpcChannel.SessionSnapshotList,
    async (): Promise<SessionSnapshotListResponse> => {
      const entries = supattyStore.toFlatEntries()
      return { envelope: { entries, savedAt: Date.now() } }
    },
  )

  ipcMain.handle(
    IpcChannel.SessionSnapshotClear,
    async (): Promise<SessionSnapshotClearResponse> => {
      supattyStore.clearAllSessions()
      return { cleared: true }
    },
  )

  return () => {
    ipcMain.removeHandler(IpcChannel.SessionSnapshotList)
    ipcMain.removeHandler(IpcChannel.SessionSnapshotClear)
  }
}
