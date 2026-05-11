import { ipcMain } from 'electron'
import { IpcChannel, NotesSetRequest, type NotesGetResponse } from '@shared/ipc'
import type { NotesStore } from '../notes/NotesStore'

export function registerNotesIpc(opts: { notesStore: NotesStore }): () => void {
  const { notesStore } = opts

  ipcMain.handle(IpcChannel.NotesGet, async (): Promise<NotesGetResponse> => {
    return { content: notesStore.get() }
  })

  ipcMain.handle(IpcChannel.NotesSet, async (_, raw): Promise<void> => {
    const req = NotesSetRequest.parse(raw)
    notesStore.set(req.content)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.NotesGet)
    ipcMain.removeHandler(IpcChannel.NotesSet)
  }
}
