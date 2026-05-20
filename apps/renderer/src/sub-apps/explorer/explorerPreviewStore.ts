import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { z } from 'zod'

/** Resizable bounds for the pinned preview panel (px). */
export const PREVIEW_MIN_WIDTH = 280
export const PREVIEW_MAX_WIDTH = 640

/**
 * Drag the splitter narrower than this and the panel snaps to collapsed instead
 * of clamping at the min — a deliberate "drag-to-hide" affordance.
 */
export const PREVIEW_COLLAPSE_THRESHOLD = 180

/**
 * Clamp a candidate width into the allowed range. `viewportWidth` (when given)
 * also caps the max so the panel can never exceed the window on small screens.
 * Pure — the single source of truth for the bounds, unit-tested in isolation.
 */
export function clampPreviewWidth(px: number, viewportWidth?: number): number {
  const max = viewportWidth ? Math.min(PREVIEW_MAX_WIDTH, viewportWidth) : PREVIEW_MAX_WIDTH
  const min = Math.min(PREVIEW_MIN_WIDTH, max)
  return Math.min(max, Math.max(min, Math.round(px)))
}

/** Initial width when nothing is persisted: ~28% of the viewport, clamped. */
export function defaultPreviewWidth(viewportWidth?: number): number {
  const vw = viewportWidth ?? 1280
  return clampPreviewWidth(Math.round(vw * 0.28), vw)
}

/** True when a dragged width is small enough to mean "collapse". Pure. */
export function shouldCollapseAt(px: number): boolean {
  return px < PREVIEW_COLLAPSE_THRESHOLD
}

interface ExplorerPreviewState {
  width: number
  collapsed: boolean
  setWidth: (px: number) => void
  setCollapsed: (collapsed: boolean) => void
  toggleCollapsed: () => void
}

const PersistedSchema = z.object({
  width: z.number(),
  collapsed: z.boolean(),
})

const STORAGE_KEY = 'supaterminal:explorer-preview'

export const useExplorerPreviewStore = create<ExplorerPreviewState>()(
  persist(
    (set) => ({
      width: defaultPreviewWidth(),
      collapsed: false,
      setWidth: (px) => set({ width: clampPreviewWidth(px) }),
      setCollapsed: (collapsed) => set({ collapsed }),
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => localStorage),
      // Validate + clamp the persisted blob: a hand-edited or stale value can
      // never push the panel out of bounds. Bad shape → fall back to defaults.
      merge: (persisted, current) => {
        const parsed = PersistedSchema.safeParse(persisted)
        if (!parsed.success) return current
        return {
          ...current,
          width: clampPreviewWidth(parsed.data.width),
          collapsed: parsed.data.collapsed,
        }
      },
      partialize: (s) => ({ width: s.width, collapsed: s.collapsed }),
    },
  ),
)
