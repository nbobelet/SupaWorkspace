import { ipcMain } from 'electron'
import { IpcChannel, NotesGetRequest, NotesSetRequest, type NotesGetResponse } from '@shared/ipc'
import type { NotesStore } from '../notes/NotesStore'

export function registerNotesIpc(opts: { notesStore: NotesStore }): () => void {
  const { notesStore } = opts

  ipcMain.handle(IpcChannel.NotesGet, async (_, raw): Promise<NotesGetResponse> => {
    const req = NotesGetRequest.parse(raw)
    return { content: notesStore.get(req.workspaceId) }
  })

  ipcMain.handle(IpcChannel.NotesSet, async (_, raw): Promise<void> => {
    const req = NotesSetRequest.parse(raw)
    notesStore.set(req.workspaceId, req.content)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.NotesGet)
    ipcMain.removeHandler(IpcChannel.NotesSet)
  }
}
