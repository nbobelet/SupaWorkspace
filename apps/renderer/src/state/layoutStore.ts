import { create } from 'zustand'

export type LayoutMode = 'single' | 'grid' | 'split-horizontal' | 'split-vertical' | 'cascade'

export const DEFAULT_LAYOUTS: LayoutMode[] = ['single', 'grid', 'split-horizontal', 'split-vertical']

export const EXPERIMENTAL_LAYOUTS_FLAG = 'experimentalLayouts'

interface LayoutStoreState {
  mode: LayoutMode
  experimentalEnabled: boolean

  setMode: (mode: LayoutMode) => void
  cycleMode: () => void
  setExperimentalEnabled: (enabled: boolean) => void
  availableModes: () => LayoutMode[]
}

export const useLayoutStore = create<LayoutStoreState>((set, get) => ({
  mode: 'single',
  experimentalEnabled: false,

  setMode: (mode) => set({ mode }),

  cycleMode: () =>
    set((prev) => {
      const modes = prev.experimentalEnabled ? [...DEFAULT_LAYOUTS, 'cascade' as LayoutMode] : DEFAULT_LAYOUTS
      const idx = modes.indexOf(prev.mode)
      const next = modes[(idx + 1) % modes.length] ?? 'single'
      return { mode: next }
    }),

  setExperimentalEnabled: (enabled) =>
    set((prev) => ({
      experimentalEnabled: enabled,
      mode: !enabled && prev.mode === 'cascade' ? 'single' : prev.mode,
    })),

  availableModes: () =>
    get().experimentalEnabled ? [...DEFAULT_LAYOUTS, 'cascade'] : DEFAULT_LAYOUTS,
}))
