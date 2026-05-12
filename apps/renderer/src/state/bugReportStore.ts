import { create } from 'zustand'
import type {
  BugReportCreateResponse,
  BugReportSeverity,
} from '@shared/bugReport'

interface BugReportDraft {
  title: string
  severity: BugReportSeverity
  description: string
  steps_to_reproduce: string
  expected_behavior: string
  actual_behavior: string
}

interface BugReportStoreState {
  isOpen: boolean
  draft: BugReportDraft
  isSubmitting: boolean
  lastError: string | null
  open: () => void
  close: () => void
  updateDraft: (patch: Partial<BugReportDraft>) => void
  submit: () => Promise<BugReportCreateResponse | null>
}

export const DEFAULT_DRAFT: BugReportDraft = {
  title: '',
  severity: 'medium',
  description: '',
  steps_to_reproduce: '',
  expected_behavior: '',
  actual_behavior: '',
}

export const useBugReportStore = create<BugReportStoreState>((set, get) => ({
  isOpen: false,
  draft: { ...DEFAULT_DRAFT },
  isSubmitting: false,
  lastError: null,

  open: (): void => {
    set({ isOpen: true, lastError: null })
  },

  close: (): void => {
    set({ isOpen: false })
  },

  updateDraft: (patch): void => {
    set((state) => ({ draft: { ...state.draft, ...patch } }))
  },

  submit: async (): Promise<BugReportCreateResponse | null> => {
    const { draft, isSubmitting } = get()
    if (isSubmitting) return null
    set({ isSubmitting: true, lastError: null })
    try {
      const res = await window.ws.bugReport.create({
        title: draft.title.trim(),
        severity: draft.severity,
        description: draft.description.trim(),
        steps_to_reproduce: draft.steps_to_reproduce.trim() || undefined,
        expected_behavior: draft.expected_behavior.trim() || undefined,
        actual_behavior: draft.actual_behavior.trim() || undefined,
      })
      set({
        isSubmitting: false,
        isOpen: false,
        draft: { ...DEFAULT_DRAFT },
        lastError: null,
      })
      return res
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ isSubmitting: false, lastError: message })
      return null
    }
  },
}))
