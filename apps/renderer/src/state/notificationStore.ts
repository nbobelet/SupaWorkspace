import { create } from 'zustand'
import type { NotificationKind } from '@shared/notification'

export interface RendererNotification {
  id: string
  workspaceId: string
  sessionId: string
  sessionLabel: string
  workspaceName: string
  kind: NotificationKind
  ts: number
  read: boolean
}

interface NotificationStoreState {
  notifications: RendererNotification[]

  push: (notif: Omit<RendererNotification, 'read'>) => void
  markRead: (id: string) => void
  markAllReadForWorkspace: (workspaceId: string) => void
  clear: (id: string) => void
  clearAll: () => void
}

const MAX_NOTIFICATIONS = 200

export const useNotificationStore = create<NotificationStoreState>((set) => ({
  notifications: [],

  push: (notif) =>
    set((prev) => {
      const next = [{ ...notif, read: false }, ...prev.notifications]
      return { notifications: next.slice(0, MAX_NOTIFICATIONS) }
    }),

  markRead: (id) =>
    set((prev) => ({
      notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),

  markAllReadForWorkspace: (workspaceId) =>
    set((prev) => ({
      notifications: prev.notifications.map((n) =>
        n.workspaceId === workspaceId ? { ...n, read: true } : n,
      ),
    })),

  clear: (id) =>
    set((prev) => ({
      notifications: prev.notifications.filter((n) => n.id !== id),
    })),

  clearAll: () => set({ notifications: [] }),
}))

export function unreadCountByWorkspace(
  notifications: RendererNotification[],
  workspaceId: string,
): number {
  let count = 0
  for (const n of notifications) {
    if (n.workspaceId === workspaceId && !n.read) count += 1
  }
  return count
}

export function recentByWorkspace(
  notifications: RendererNotification[],
  workspaceId: string,
  limit = 20,
): RendererNotification[] {
  const filtered: RendererNotification[] = []
  for (const n of notifications) {
    if (n.workspaceId === workspaceId) filtered.push(n)
    if (filtered.length >= limit) break
  }
  return filtered
}
