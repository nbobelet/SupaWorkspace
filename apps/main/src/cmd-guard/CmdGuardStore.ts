import { randomUUID } from 'node:crypto'
import Store from 'electron-store'
import {
  DEFAULT_CMD_GUARD_RULES,
  type CmdGuardAuditEntry,
  type CmdGuardDecision,
  type CmdGuardRule,
} from '@shared/cmdGuard'

interface Shape {
  rules: CmdGuardRule[]
  audit: CmdGuardAuditEntry[]
}

const MAX_AUDIT = 500

export class CmdGuardStore {
  private readonly store: Store<Shape>

  constructor() {
    this.store = new Store<Shape>({
      name: 'cmd-guard',
      defaults: { rules: DEFAULT_CMD_GUARD_RULES, audit: [] },
      clearInvalidConfig: true,
    })
  }

  getRules(): CmdGuardRule[] {
    return this.store.get('rules', DEFAULT_CMD_GUARD_RULES)
  }

  setRules(rules: CmdGuardRule[]): void {
    this.store.set('rules', rules)
  }

  getAudit(): CmdGuardAuditEntry[] {
    return this.store.get('audit', [])
  }

  appendAudit(entry: { cmd: string; ruleId: string; decision: CmdGuardDecision }): CmdGuardAuditEntry {
    const next: CmdGuardAuditEntry = {
      id: randomUUID(),
      ts: Date.now(),
      cmd: entry.cmd,
      ruleId: entry.ruleId,
      decision: entry.decision,
    }
    const current = this.getAudit()
    const updated = [next, ...current].slice(0, MAX_AUDIT)
    this.store.set('audit', updated)
    return next
  }
}
