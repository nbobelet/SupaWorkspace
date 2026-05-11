import { create } from 'zustand'
import type { Workspace } from '@shared/workspace'

interface WorkspaceStoreState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null

  setWorkspaces: (workspaces: Workspace[]) => void
  upsertWorkspace: (workspace: Workspace) => void
  removeWorkspace: (id: string) => void
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
