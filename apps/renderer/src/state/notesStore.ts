import { create } from 'zustand'

interface NotesStoreState {
  byWorkspace: Record<string, string>
  loadedFor: Record<string, true>
  load: (workspaceId: string) => Promise<void>
  setContent: (workspaceId: string, next: string) => void
  flush: (workspaceId: string) => Promise<void>
}

const SAVE_DEBOUNCE_MS = 500

const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
const pendingContent: Record<string, string> = {}

function scheduleSave(workspaceId: string, content: string): void {
  pendingContent[workspaceId] = content
  const existing = saveTimers[workspaceId]
  if (existing !== undefined) clearTimeout(existing)
  saveTimers[workspaceId] = setTimeout(() => {
    delete saveTimers[workspaceId]
    const toWrite = pendingContent[workspaceId]
    delete pendingContent[workspaceId]
    if (toWrite !== undefined) {
      void window.ws.notes.set(workspaceId, toWrite)
    }
  }, SAVE_DEBOUNCE_MS)
}

export const useNotesStore = create<NotesStoreState>((set, get) => ({
  byWorkspace: {},
  loadedFor: {},

  load: async (workspaceId): Promise<void> => {
    if (get().loadedFor[workspaceId]) return
    const res = await window.ws.notes.get(workspaceId)
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.content },
      loadedFor: { ...prev.loadedFor, [workspaceId]: true },
    }))
  },

  setContent: (workspaceId, next): void => {
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: next },
    }))
    scheduleSave(workspaceId, next)
  },

  flush: async (workspaceId): Promise<void> => {
    const timer = saveTimers[workspaceId]
    if (timer !== undefined) {
      clearTimeout(timer)
      delete saveTimers[workspaceId]
    }
    const toWrite = pendingContent[workspaceId]
    if (toWrite !== undefined) {
      delete pendingContent[workspaceId]
      await window.ws.notes.set(workspaceId, toWrite)
    }
  },
}))
