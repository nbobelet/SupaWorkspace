import { ipcMain } from 'electron'
import {
  IpcChannel,
  InputHistoryAppendRequest,
  type InputHistoryGetResponse,
  type InputHistoryAppendResponse,
} from '@shared/ipc'
import type { InputHistoryStore } from '../input-history/InputHistoryStore'

export function registerInputHistoryIpc(opts: { inputHistoryStore: InputHistoryStore }): () => void {
  const { inputHistoryStore } = opts

  ipcMain.handle(IpcChannel.InputHistoryGet, async (): Promise<InputHistoryGetResponse> => {
    return { entries: inputHistoryStore.get() }
  })

  ipcMain.handle(IpcChannel.InputHistoryAppend, async (_, raw): Promise<InputHistoryAppendResponse> => {
    const req = InputHistoryAppendRequest.parse(raw)
    const entries = inputHistoryStore.append(req.entry)
    return { entries }
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.InputHistoryGet)
    ipcMain.removeHandler(IpcChannel.InputHistoryAppend)
  }
}
