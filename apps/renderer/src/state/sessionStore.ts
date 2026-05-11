import { useMemo } from 'react'
import { create } from 'zustand'
import type { SessionState, SessionType } from '@shared/session'
import { useWorkspaceStore } from './workspaceStore'

export interface RendererSession {
  id: string
  workspaceId: string
  type: SessionType
  label: string
  state: SessionState
  hasUnseenWaiting: boolean
}

interface SessionStoreState {
  sessions: Record<string, RendererSession>
  order: string[]
  activeId: string | null
  lastUsedType: SessionType

  addSession: (s: RendererSession) => void
  removeSession: (id: string) => void
  setState: (id: string, state: SessionState) => void
  setActive: (id: string | null) => void
  clearWaitingBadge: (id: string) => void
  setLastUsedType: (type: SessionType) => void
  renameSession: (id: string, label: string) => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: {},
  order: [],
  activeId: null,
  lastUsedType: 'shell',

  addSession: (s) =>
    set((prev) => ({
      sessions: { ...prev.sessions, [s.id]: s },
      order: prev.order.includes(s.id) ? prev.order : [...prev.order, s.id],
      activeId: prev.activeId ?? s.id,
      lastUsedType: s.type,
    })),

  removeSession: (id) =>
    set((prev) => {
      const { [id]: _removed, ...rest } = prev.sessions
      const order = prev.order.filter((sid) => sid !== id)
      const activeId =
        prev.activeId === id ? (order[order.length - 1] ?? null) : prev.activeId
      return { sessions: rest, order, activeId }
    }),

  setState: (id, state) =>
    set((prev) => {
      const existing = prev.sessions[id]
      if (!existing) return prev
      const hasUnseenWaiting =
        state === 'waiting-for-input' && prev.activeId !== id ? true : existing.hasUnseenWaiting
      return {
        sessions: { ...prev.sessions, [id]: { ...existing, state, hasUnseenWaiting } },
      }
    }),

  setActive: (id) =>
    set((prev) => {
      if (id === null) return { activeId: null }
      const existing = prev.sessions[id]
      if (!existing) return prev
      return {
        activeId: id,
        sessions: { ...prev.sessions, [id]: { ...existing, hasUnseenWaiting: false } },
      }
    }),

  clearWaitingBadge: (id) =>
    set((prev) => {
      const existing = prev.sessions[id]
      if (!existing) return prev
      return {
        sessions: { ...prev.sessions, [id]: { ...existing, hasUnseenWaiting: false } },
      }
    }),

  setLastUsedType: (type) => set({ lastUsedType: type }),

  renameSession: (id, label) =>
    set((prev) => {
      const existing = prev.sessions[id]
      if (!existing) return prev
      return {
        sessions: { ...prev.sessions, [id]: { ...existing, label } },
      }
    }),
}))

export function scopeOrder(
  order: string[],
  sessions: Record<string, RendererSession>,
  workspaceId: string | null,
): string[] {
  if (!workspaceId) return []
  return order.filter((id) => sessions[id]?.workspaceId === workspaceId)
}

export function useScopedOrder(): string[] {
  const order = useSessionStore((s) => s.order)
  const sessions = useSessionStore((s) => s.sessions)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  return useMemo(
    () => scopeOrder(order, sessions, activeWorkspaceId),
    [order, sessions, activeWorkspaceId],
  )
}
