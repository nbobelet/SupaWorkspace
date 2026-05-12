import { create } from 'zustand'
import { matchCmdGuardRule } from '../lib/cmdGuard'
import { useCmdGuardStore } from './cmdGuardStore'

interface InputBarState {
  value: string
  history: string[]
  historyIndex: number | null
  loaded: boolean
  visible: boolean

  load: () => Promise<void>
  setValue: (next: string) => void
  clear: () => void
  toggleVisible: () => void
  setVisible: (next: boolean) => void
  submit: (sessionId: string) => Promise<void>
  historyPrev: () => void
  historyNext: () => void
}

export const useInputBarStore = create<InputBarState>((set, get) => ({
  value: '',
  history: [],
  historyIndex: null,
  loaded: false,
  visible: true,

  load: async (): Promise<void> => {
    if (get().loaded) return
    const res = await window.ws.inputHistory.get()
    set({ history: res.entries, loaded: true })
  },

  setValue: (next): void => set({ value: next, historyIndex: null }),

  clear: (): void => set({ value: '', historyIndex: null }),

  toggleVisible: (): void => set((prev) => ({ visible: !prev.visible })),

  setVisible: (next): void => set({ visible: next }),

  submit: async (sessionId): Promise<void> => {
    const value = get().value
    if (value.length === 0) return
    const rules = useCmdGuardStore.getState().rules
    const matched = matchCmdGuardRule(value, rules)
    if (matched) {
      const granted = await useCmdGuardStore.getState().request(value, matched)
      if (!granted) return
    }
    await window.ws.session.write({ sessionId, data: `${value}\r` })
    const res = await window.ws.inputHistory.append({ entry: value })
    set({ value: '', history: res.entries, historyIndex: null })
  },

  historyPrev: (): void =>
    set((prev) => {
      if (prev.history.length === 0) return prev
      const nextIdx =
        prev.historyIndex === null
          ? prev.history.length - 1
          : Math.max(0, prev.historyIndex - 1)
      const entry = prev.history[nextIdx]
      if (entry === undefined) return prev
      return { historyIndex: nextIdx, value: entry }
    }),

  historyNext: (): void =>
    set((prev) => {
      if (prev.historyIndex === null) return prev
      const nextIdx = prev.historyIndex + 1
      if (nextIdx >= prev.history.length) {
        return { historyIndex: null, value: '' }
      }
      const entry = prev.history[nextIdx]
      if (entry === undefined) return prev
      return { historyIndex: nextIdx, value: entry }
    }),
}))
