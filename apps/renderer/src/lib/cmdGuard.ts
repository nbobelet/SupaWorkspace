import type { CmdGuardRule } from '@shared/cmdGuard'

export function matchCmdGuardRule(value: string, rules: readonly CmdGuardRule[]): CmdGuardRule | null {
  for (const rule of rules) {
    if (!rule.enabled) continue
    let regex: RegExp
    try {
      regex = new RegExp(rule.pattern)
    } catch {
      continue
    }
    if (regex.test(value)) return rule
  }
  return null
}
