import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import type {
  SessionSnapshotListResponse,
  SessionSnapshotClearResponse,
} from '@shared/snapshot'
import type { SessionSnapshotStore } from '../sessions-snapshot/SessionSnapshotStore'

export function registerSessionSnapshotIpc(opts: {
  snapshotStore: SessionSnapshotStore
}): () => void {
  const { snapshotStore } = opts

  ipcMain.handle(IpcChannel.SessionSnapshotList, async (): Promise<SessionSnapshotListResponse> => {
    return { envelope: snapshotStore.get() }
  })

  ipcMain.handle(IpcChannel.SessionSnapshotClear, async (): Promise<SessionSnapshotClearResponse> => {
    snapshotStore.clear()
    return { cleared: true }
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.SessionSnapshotList)
    ipcMain.removeHandler(IpcChannel.SessionSnapshotClear)
  }
}
