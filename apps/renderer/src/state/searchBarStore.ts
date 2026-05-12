import { create } from 'zustand'

/**
 * Per-session open-state for the floating `SearchBar`. Only one
 * SearchBar may be open at a time across the whole window — `toggle()`
 * therefore wipes any other entry on open. The store is intentionally
 * minimal (no input value, no current-match state) because the
 * SearchAddon owns the search state itself; the store just decides
 * whether the bar's chrome is rendered for a given pane.
 */
interface SearchBarState {
  openBySession: Record<string, boolean>
  toggle: (sessionId: string) => void
  close: (sessionId: string) => void
}

export const useSearchBarStore = create<SearchBarState>((set) => ({
  openBySession: {},
  toggle: (sessionId) =>
    set((prev) => {
      const wasOpen = prev.openBySession[sessionId] === true
      if (wasOpen) {
        const next: Record<string, boolean> = { ...prev.openBySession }
        delete next[sessionId]
        return { openBySession: next }
      }
      // Open exclusively: replace the map so only this session is true.
      return { openBySession: { [sessionId]: true } }
    }),
  close: (sessionId) =>
    set((prev) => {
      if (prev.openBySession[sessionId] !== true) return prev
      const next: Record<string, boolean> = { ...prev.openBySession }
      delete next[sessionId]
      return { openBySession: next }
    }),
}))
