import { create } from 'zustand'
import type { VoiceRejectReason } from '@shared/ipc'

/**
 * Renderer-only state for push-to-talk. Three concerns, all keyed by session:
 *  - `listeningSessionId`: the session locked at key-down currently capturing.
 *  - `staged`: a transcript awaiting the user's review in the staging chip —
 *    NOT yet written anywhere. The user inserts or discards it.
 *  - `rejected`: the last machine reason a capture produced nothing, surfaced
 *    as a transient badge then cleared.
 */
interface VoiceStoreState {
  listeningSessionId: string | null
  staged: Record<string, string>
  rejected: Record<string, VoiceRejectReason>
  startListening: (sessionId: string) => void
  stopListening: () => void
  setStaged: (sessionId: string, text: string) => void
  clearStaged: (sessionId: string) => void
  setRejected: (sessionId: string, reason: VoiceRejectReason) => void
  clearRejected: (sessionId: string) => void
}

export const useVoiceStore = create<VoiceStoreState>((set) => ({
  listeningSessionId: null,
  staged: {},
  rejected: {},
  startListening: (sessionId) => set({ listeningSessionId: sessionId }),
  stopListening: () => set({ listeningSessionId: null }),
  setStaged: (sessionId, text) =>
    set((prev) => ({
      staged: { ...prev.staged, [sessionId]: text },
      rejected: omit(prev.rejected, sessionId),
    })),
  clearStaged: (sessionId) => set((prev) => ({ staged: omit(prev.staged, sessionId) })),
  setRejected: (sessionId, reason) =>
    set((prev) => ({ rejected: { ...prev.rejected, [sessionId]: reason } })),
  clearRejected: (sessionId) => set((prev) => ({ rejected: omit(prev.rejected, sessionId) })),
}))

function omit<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key]
  return next
}
