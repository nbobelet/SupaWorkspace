import { create } from 'zustand'
import { useWorkspaceStore } from './workspaceStore'

export type LayoutMode = 'single' | 'grid' | 'split-horizontal' | 'split-vertical' | 'cascade'

export const DEFAULT_LAYOUTS: LayoutMode[] = ['single', 'grid', 'split-horizontal', 'split-vertical']

export const EXPERIMENTAL_LAYOUTS_FLAG = 'experimentalLayouts'

interface LayoutStoreState {
  modeByWorkspace: Record<string, LayoutMode>
  experimentalEnabled: boolean

  getMode: (workspaceId: string) => LayoutMode
  setMode: (workspaceId: string, mode: LayoutMode) => void
  cycleMode: (workspaceId: string) => void
  setExperimentalEnabled: (enabled: boolean) => void
  availableModes: () => LayoutMode[]
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  modeByWorkspace: {},
  experimentalEnabled: false,

  getMode: (workspaceId) => get().modeByWorkspace[workspaceId] ?? 'single',

  setMode: (workspaceId, mode) =>
    set((prev) => ({
      modeByWorkspace: { ...prev.modeByWorkspace, [workspaceId]: mode },
    })),

  cycleMode: (workspaceId) =>
    set((prev) => {
      const modes = prev.experimentalEnabled
        ? [...DEFAULT_LAYOUTS, 'cascade' as LayoutMode]
        : DEFAULT_LAYOUTS
      const current = prev.modeByWorkspace[workspaceId] ?? 'single'
      const idx = modes.indexOf(current)
      const next = modes[(idx + 1) % modes.length] ?? 'single'
      return {
        modeByWorkspace: { ...prev.modeByWorkspace, [workspaceId]: next },
      }
    }),

  setExperimentalEnabled: (enabled) =>
    set((prev) => {
      if (enabled) return { experimentalEnabled: true }
      const cleaned = Object.fromEntries(
        Object.entries(prev.modeByWorkspace).map(([k, v]) => [k, v === 'cascade' ? ('single' as LayoutMode) : v]),
      )
      return { experimentalEnabled: false, modeByWorkspace: cleaned }
    }),

  availableModes: () =>
    get().experimentalEnabled ? [...DEFAULT_LAYOUTS, 'cascade'] : DEFAULT_LAYOUTS,
}))

export function useActiveLayoutMode(): LayoutMode {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const modeByWorkspace = useLayoutStore((s) => s.modeByWorkspace)
  return activeWorkspaceId ? (modeByWorkspace[activeWorkspaceId] ?? 'single') : 'single'
}
