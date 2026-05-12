import { create } from 'zustand'
import type { CmdGuardAuditEntry, CmdGuardRule } from '@shared/cmdGuard'

interface PendingDecision {
  cmd: string
  rule: CmdGuardRule
  resolve: (granted: boolean) => void
}

interface CmdGuardState {
  rules: CmdGuardRule[]
  audit: CmdGuardAuditEntry[]
  loaded: boolean
  pending: PendingDecision | null

  load: () => Promise<void>
  request: (cmd: string, rule: CmdGuardRule) => Promise<boolean>
  decide: (granted: boolean) => Promise<void>
  setRules: (rules: CmdGuardRule[]) => Promise<void>
}

export const useCmdGuardStore = create<CmdGuardState>((set, get) => ({
  rules: [],
  audit: [],
  loaded: false,
  pending: null,

  load: async (): Promise<void> => {
    if (get().loaded) return
    const res = await window.ws.cmdGuard.get()
    set({ rules: res.rules, audit: res.audit, loaded: true })
  },

  request: (cmd, rule): Promise<boolean> => {
    return new Promise<boolean>((resolve) => {
      set({ pending: { cmd, rule, resolve } })
    })
  },

  decide: async (granted): Promise<void> => {
    const pending = get().pending
    if (!pending) return
    set({ pending: null })
    pending.resolve(granted)
    const res = await window.ws.cmdGuard.appendAudit({
      cmd: pending.cmd,
      ruleId: pending.rule.id,
      decision: granted ? 'granted' : 'denied',
    })
    set({ rules: res.rules, audit: res.audit })
  },

  setRules: async (rules): Promise<void> => {
    await window.ws.cmdGuard.setRules({ rules })
    set({ rules })
  },
}))
