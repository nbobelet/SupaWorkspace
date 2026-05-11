import { create } from 'zustand'

interface NotesStoreState {
  content: string
  loaded: boolean
  load: () => Promise<void>
  setContent: (next: string) => void
  flush: () => Promise<void>
}

const SAVE_DEBOUNCE_MS = 500

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingContent: string | null = null

async function scheduleSave(content: string): Promise<void> {
  pendingContent = content
  if (saveTimer !== null) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    const toWrite = pendingContent
    pendingContent = null
    if (toWrite !== null) {
      void window.ws.notes.set(toWrite)
    }
  }, SAVE_DEBOUNCE_MS)
}

export const useNotesStore = create<NotesStoreState>((set, get) => ({
  content: '',
  loaded: false,

  load: async (): Promise<void> => {
    if (get().loaded) return
    const res = await window.ws.notes.get()
    set({ content: res.content, loaded: true })
  },

  setContent: (next): void => {
    set({ content: next })
    void scheduleSave(next)
  },

  flush: async (): Promise<void> => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    if (pendingContent !== null) {
      const toWrite = pendingContent
      pendingContent = null
      await window.ws.notes.set(toWrite)
    }
  },
}))
