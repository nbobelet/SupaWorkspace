import { create } from 'zustand'

interface PaletteStoreState {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

export const usePaletteStore = create<PaletteStoreState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
  toggle: () => set((prev) => ({ open: !prev.open })),
}))
