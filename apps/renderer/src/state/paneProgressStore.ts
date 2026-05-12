import { create } from 'zustand'

/**
 * One OSC 9;4 progress reading, mirroring the
 * `IProgressState` interface from `@xterm/addon-progress`:
 *  - 0 = no progress (idle — pill is hidden)
 *  - 1 = normal percentage progress (0..100)
 *  - 2 = error  (value optional, often 0)
 *  - 3 = indeterminate (value ignored)
 *  - 4 = paused / warning (value optional)
 */
export interface ProgressEntry {
  state: 0 | 1 | 2 | 3 | 4
  value: number
}

/**
 * Per-session OSC 9;4 progress state.
 *
 * Lifecycle:
 *  - `set(sessionId, entry)` is called inside the ProgressAddon's
 *    `onChange` callback (wired in `useTerminalSession.getOrCreateHandle`).
 *  - `clear(sessionId)` is called by `disposeTerminal` so a stale
 *    progress entry never outlives the PTY whose state it described.
 *  - Renderers subscribe with a selector like
 *    `usePaneProgressStore(s => s.progressBySession[sessionId])` so they
 *    re-render only when *their* session's progress changes.
 *
 * The store is intentionally minimal — no labels, no estimated-time
 * derivation. Those belong in the consumer (`TerminalPane`) which knows
 * the design-token classes and the desired display format.
 */
interface PaneProgressState {
  progressBySession: Record<string, ProgressEntry | null>
  set: (sessionId: string, entry: ProgressEntry | null) => void
  clear: (sessionId: string) => void
}

export const usePaneProgressStore = create<PaneProgressState>((set) => ({
  progressBySession: {},
  set: (sessionId, entry) =>
    set((prev) => {
      const current = prev.progressBySession[sessionId] ?? null
      if (
        current === null && entry === null
      ) {
        return prev
      }
      if (
        current !== null &&
        entry !== null &&
        current.state === entry.state &&
        current.value === entry.value
      ) {
        return prev
      }
      return {
        progressBySession: { ...prev.progressBySession, [sessionId]: entry },
      }
    }),
  clear: (sessionId) =>
    set((prev) => {
      if (!(sessionId in prev.progressBySession)) return prev
      const next: Record<string, ProgressEntry | null> = { ...prev.progressBySession }
      delete next[sessionId]
      return { progressBySession: next }
    }),
}))
