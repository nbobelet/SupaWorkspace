import { create } from 'zustand'
import type { SubAppId } from '@shared/sub-app'
import type { Workspace } from '@shared/workspace'

interface WorkspaceStoreState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  activeSubAppId: Record<string, SubAppId>
  expandedSubApps: Record<string, Record<SubAppId, boolean>>

  setWorkspaces: (workspaces: Workspace[]) => void
  upsertWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  reorderWorkspaces: (fromIndex: number, toIndex: number) => void
  setActiveWorkspace: (id: string | null) => void
  setColor: (id: string, hue: number) => Promise<void>
  getActiveWorkspace: () => Workspace | null
  setActiveSubApp: (workspaceId: string, subAppId: SubAppId) => void
  toggleSubAppExpanded: (workspaceId: string, subAppId: SubAppId) => void
}

const SUBAPP_EXPANDED_DEFAULT: Record<SubAppId, boolean> = {
  supatty: true,
  notes: false,
  todo: false,
  // Dashboard is a leaf view (no expandable children) — collapsed flag is inert
  // but the Record must stay exhaustive over SubAppId.
  dashboard: false,
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  activeSubAppId: {},
  expandedSubApps: {},

  setWorkspaces: (workspaces) =>
    set((prev) => ({
      workspaces,
      activeWorkspaceId:
        prev.activeWorkspaceId && workspaces.some((w) => w.id === prev.activeWorkspaceId)
          ? prev.activeWorkspaceId
          : (workspaces[0]?.id ?? null),
    })),

  upsertWorkspace: (workspace) =>
    set((prev) => {
      const existing = prev.workspaces.find((w) => w.id === workspace.id)
      const workspaces = existing
        ? prev.workspaces.map((w) => (w.id === workspace.id ? workspace : w))
        : [...prev.workspaces, workspace]
      return {
        workspaces,
        activeWorkspaceId: prev.activeWorkspaceId ?? workspace.id,
      }
    }),

  removeWorkspace: (id) =>
    set((prev) => {
      const workspaces = prev.workspaces.filter((w) => w.id !== id)
      const activeWorkspaceId =
        prev.activeWorkspaceId === id ? (workspaces[0]?.id ?? null) : prev.activeWorkspaceId
      return { workspaces, activeWorkspaceId }
    }),

  reorderWorkspaces: (fromIndex, toIndex) =>
    set((prev) => {
      if (fromIndex === toIndex) return prev
      if (fromIndex < 0 || toIndex < 0) return prev
      if (fromIndex >= prev.workspaces.length || toIndex >= prev.workspaces.length) return prev
      const next = [...prev.workspaces]
      const [moved] = next.splice(fromIndex, 1)
      if (!moved) return prev
      next.splice(toIndex, 0, moved)
      return { workspaces: next }
    }),

  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),

  setColor: async (id: string, hue: number): Promise<void> => {
    const updated = await window.ws.workspace.setColor(id, hue)
    set((prev) => ({
      workspaces: prev.workspaces.map((w) => (w.id === id ? updated : w)),
    }))
  },

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get()
    return workspaces.find((w) => w.id === activeWorkspaceId) ?? null
  },

  setActiveSubApp: (workspaceId, subAppId) =>
    set((prev) => ({
      activeSubAppId: { ...prev.activeSubAppId, [workspaceId]: subAppId },
    })),

  toggleSubAppExpanded: (workspaceId, subAppId) =>
    set((prev) => {
      const current = prev.expandedSubApps[workspaceId] ?? SUBAPP_EXPANDED_DEFAULT
      const nextForWorkspace: Record<SubAppId, boolean> = {
        ...current,
        [subAppId]: !current[subAppId],
      }
      return {
        expandedSubApps: { ...prev.expandedSubApps, [workspaceId]: nextForWorkspace },
      }
    }),
}))

/**
 * Active sub-app for a workspace. Defaults to `'supatty'` when no preference
 * has been recorded yet (lazy default — never written to state).
 */
export const useActiveSubApp = (workspaceId: string): SubAppId =>
  useWorkspaceStore((s) => s.activeSubAppId[workspaceId] ?? 'supatty')

/**
 * Whether a given sub-app row is expanded in the sidebar for a workspace.
 * Defaults: supatty expanded, notes collapsed. Resolved lazily so the
 * initial render matches the toggle semantics without seeding state.
 */
export const useIsSubAppExpanded = (workspaceId: string, subAppId: SubAppId): boolean =>
  useWorkspaceStore(
    (s) => s.expandedSubApps[workspaceId]?.[subAppId] ?? SUBAPP_EXPANDED_DEFAULT[subAppId],
  )
