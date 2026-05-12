import { useMemo } from 'react'
import { create } from 'zustand'
import type { SessionState, SessionType } from '@shared/session'
import { useWorkspaceStore } from './workspaceStore'
import { getSessionStatus, getStatusPriority } from './sessionStatus'

export interface RendererSession {
  id: string
  workspaceId: string
  type: SessionType
  label: string
  state: SessionState
  exitCode: number | null
  hasUnseenAsking: boolean
  hasUnseenEnding: boolean
  badgeCount: number
  // Snapshot-restored placeholder: no PTY spawned yet. Cleared on activation.
  pendingSpawn?: boolean
}

interface SessionStoreState {
  sessions: Record<string, RendererSession>
  order: string[]
  activeId: string | null
  activeByWorkspace: Record<string, string>
  lastUsedType: SessionType

  addSession: (
    s: Omit<RendererSession, 'badgeCount' | 'exitCode' | 'hasUnseenAsking' | 'hasUnseenEnding'> & {
      badgeCount?: number
      exitCode?: number | null
      hasUnseenAsking?: boolean
      hasUnseenEnding?: boolean
    },
  ) => void
  removeSession: (id: string) => void
  setState: (id: string, state: SessionState, exitCode?: number | null) => void
  setActive: (id: string | null) => void
  clearAttentionBadge: (id: string) => void
  bumpBadge: (id: string) => void
  setLastUsedType: (type: SessionType) => void
  renameSession: (id: string, label: string) => void
  reorderScopedTab: (workspaceId: string, from: number, to: number) => void
  materializeSession: (placeholderId: string, realId: string, label: string) => void
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  sessions: {},
  order: [],
  activeId: null,
  activeByWorkspace: {},
  lastUsedType: 'shell',

  addSession: (s) =>
    set((prev) => {
      const isFirstForWorkspace = prev.activeByWorkspace[s.workspaceId] === undefined
      const session: RendererSession = {
        badgeCount: 0,
        exitCode: null,
        hasUnseenAsking: false,
        hasUnseenEnding: false,
        ...s,
      }
      return {
        sessions: { ...prev.sessions, [s.id]: session },
        order: prev.order.includes(s.id) ? prev.order : [...prev.order, s.id],
        activeId: prev.activeId ?? s.id,
        activeByWorkspace: isFirstForWorkspace
          ? { ...prev.activeByWorkspace, [s.workspaceId]: s.id }
          : prev.activeByWorkspace,
        lastUsedType: s.type,
      }
    }),

  removeSession: (id) =>
    set((prev) => {
      const removed = prev.sessions[id]
      const { [id]: _removed, ...rest } = prev.sessions
      const order = prev.order.filter((sid) => sid !== id)
      // Same-workspace fallback first. Only fall back to any session if the
      // killed session had no workspace siblings — otherwise we'd hop to a
      // different workspace and surface its content under the current one.
      const sameWorkspaceFallback = removed
        ? (order.find((sid) => rest[sid]?.workspaceId === removed.workspaceId) ?? null)
        : null
      const activeId =
        prev.activeId === id
          ? (sameWorkspaceFallback ?? order[order.length - 1] ?? null)
          : prev.activeId
      let activeByWorkspace = prev.activeByWorkspace
      if (removed && activeByWorkspace[removed.workspaceId] === id) {
        const next = { ...activeByWorkspace }
        if (sameWorkspaceFallback) next[removed.workspaceId] = sameWorkspaceFallback
        else delete next[removed.workspaceId]
        activeByWorkspace = next
      }
      return { sessions: rest, order, activeId, activeByWorkspace }
    }),

  setState: (id, state, exitCode) =>
    set((prev) => {
      const existing = prev.sessions[id]
      if (!existing) return prev
      const hasUnseenAsking =
        state === 'asking' && prev.activeId !== id ? true : existing.hasUnseenAsking
      const hasUnseenEnding =
        state === 'ending' && prev.activeId !== id ? true : existing.hasUnseenEnding
      const nextExitCode =
        exitCode !== undefined ? exitCode : state === 'ending' ? existing.exitCode : null
      return {
        sessions: {
          ...prev.sessions,
          [id]: {
            ...existing,
            state,
            exitCode: state === 'ending' ? nextExitCode : null,
            hasUnseenAsking,
            hasUnseenEnding,
          },
        },
      }
    }),

  setActive: (id) =>
    set((prev) => {
      if (id === null) return { activeId: null }
      const existing = prev.sessions[id]
      if (!existing) return prev
      return {
        activeId: id,
        activeByWorkspace: { ...prev.activeByWorkspace, [existing.workspaceId]: id },
        sessions: {
          ...prev.sessions,
          [id]: {
            ...existing,
            hasUnseenAsking: false,
            hasUnseenEnding: false,
            badgeCount: 0,
          },
        },
      }
    }),

  clearAttentionBadge: (id) =>
    set((prev) => {
      const existing = prev.sessions[id]
      if (!existing) return prev
      return {
        sessions: {
          ...prev.sessions,
          [id]: { ...existing, hasUnseenAsking: false, hasUnseenEnding: false, badgeCount: 0 },
        },
      }
    }),

  bumpBadge: (id) =>
    set((prev) => {
      const existing = prev.sessions[id]
      if (!existing) return prev
      return {
        sessions: {
          ...prev.sessions,
          [id]: { ...existing, badgeCount: existing.badgeCount + 1 },
        },
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

  reorderScopedTab: (workspaceId, from, to) =>
    set((prev) => ({
      order: reorderScoped(prev.order, prev.sessions, workspaceId, from, to),
    })),

  materializeSession: (placeholderId, realId, label) =>
    set((prev) => {
      const existing = prev.sessions[placeholderId]
      if (!existing) return prev
      const { [placeholderId]: _drop, ...rest } = prev.sessions
      const materialized: RendererSession = {
        ...existing,
        id: realId,
        label,
        pendingSpawn: false,
      }
      const order = prev.order.map((sid) => (sid === placeholderId ? realId : sid))
      const activeByWorkspace = { ...prev.activeByWorkspace }
      for (const ws in activeByWorkspace) {
        if (activeByWorkspace[ws] === placeholderId) activeByWorkspace[ws] = realId
      }
      const activeId = prev.activeId === placeholderId ? realId : prev.activeId
      return {
        sessions: { ...rest, [realId]: materialized },
        order,
        activeId,
        activeByWorkspace,
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

export function reorderScoped(
  order: readonly string[],
  sessions: Record<string, RendererSession>,
  workspaceId: string,
  from: number,
  to: number,
): string[] {
  const next = [...order]
  const scoped: Array<{ id: string; idx: number }> = []
  for (let i = 0; i < next.length; i += 1) {
    const id = next[i]
    if (id && sessions[id]?.workspaceId === workspaceId) {
      scoped.push({ id, idx: i })
    }
  }
  if (from < 0 || from >= scoped.length) return next
  if (to < 0 || to >= scoped.length) return next
  if (from === to) return next
  const ids = scoped.map((e) => e.id)
  const [moved] = ids.splice(from, 1)
  if (!moved) return next
  ids.splice(to, 0, moved)
  scoped.forEach((entry, i) => {
    const replacement = ids[i]
    if (replacement !== undefined) next[entry.idx] = replacement
  })
  return next
}

export function selectHighestPriorityTabId(
  sessions: Record<string, RendererSession>,
  scopedOrder: readonly string[],
): string | null {
  let best: { id: string; priority: number } | null = null
  for (const id of scopedOrder) {
    const s = sessions[id]
    if (!s) continue
    const priority = getStatusPriority(getSessionStatus(s.state, s.exitCode))
    if (priority < 2) continue
    if (!best || priority > best.priority) {
      best = { id, priority }
    }
  }
  return best?.id ?? null
}

export function useHighestPriorityTabId(): string | null {
  const sessions = useSessionStore((s) => s.sessions)
  const scopedOrder = useScopedOrder()
  return useMemo(
    () => selectHighestPriorityTabId(sessions, scopedOrder),
    [sessions, scopedOrder],
  )
}

export function useWorkspaceWorstStatus(workspaceId: string): ReturnType<typeof getSessionStatus> {
  const sessions = useSessionStore((s) => s.sessions)
  return useMemo(() => {
    let worst: ReturnType<typeof getSessionStatus> = 'idle'
    let worstPriority = -1
    for (const id in sessions) {
      const s = sessions[id]
      if (!s || s.workspaceId !== workspaceId) continue
      const status = getSessionStatus(s.state, s.exitCode)
      const p = getStatusPriority(status)
      if (p > worstPriority) {
        worstPriority = p
        worst = status
      }
    }
    return worst
  }, [sessions, workspaceId])
}
