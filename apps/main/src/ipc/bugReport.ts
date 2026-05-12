import { ipcMain } from 'electron'
import {
  IpcChannel,
  BugReportCreateRequest,
  type BugReportCreateResponse,
  type BugReportListResponse,
} from '@shared/ipc'
import type { BugReportStore } from '../bug-report/BugReportStore'

export function registerBugReportIpc(opts: { bugReportStore: BugReportStore }): () => void {
  const { bugReportStore } = opts

  ipcMain.handle(IpcChannel.BugReportCreate, async (_, raw): Promise<BugReportCreateResponse> => {
    const req = BugReportCreateRequest.parse(raw)
    return bugReportStore.create(req)
  })

  ipcMain.handle(IpcChannel.BugReportList, async (): Promise<BugReportListResponse> => {
    const reports = await bugReportStore.list()
    return { reports }
  })

  ipcMain.handle(IpcChannel.BugReportRevealDir, async (): Promise<void> => {
    await bugReportStore.revealDir()
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.BugReportCreate)
    ipcMain.removeHandler(IpcChannel.BugReportList)
    ipcMain.removeHandler(IpcChannel.BugReportRevealDir)
  }
}
