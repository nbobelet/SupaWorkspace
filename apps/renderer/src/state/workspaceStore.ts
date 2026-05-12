import { create } from 'zustand'
import type { Workspace } from '@shared/workspace'

interface WorkspaceStoreState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null

  setWorkspaces: (workspaces: Workspace[]) => void
  upsertWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
  reorderWorkspaces: (fromIndex: number, toIndex: number) => void
  setActiveWorkspace: (id: string | null) => void
  setColor: (id: string, hue: number) => Promise<void>
  getActiveWorkspace: () => Workspace | null
}

export const useWorkspaceStore = create<WorkspaceStoreState>((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,

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
}))
