import { z } from 'zod'

export const CmdGuardRule = z.object({
  id: z.string(),
  pattern: z.string(),
  description: z.string(),
  enabled: z.boolean(),
})
export type CmdGuardRule = z.infer<typeof CmdGuardRule>

export const CmdGuardDecision = z.enum(['granted', 'denied'])
export type CmdGuardDecision = z.infer<typeof CmdGuardDecision>

export const CmdGuardAuditEntry = z.object({
  id: z.string(),
  ts: z.number().int(),
  cmd: z.string(),
  ruleId: z.string(),
  decision: CmdGuardDecision,
})
export type CmdGuardAuditEntry = z.infer<typeof CmdGuardAuditEntry>

export const CmdGuardGetResponse = z.object({
  rules: z.array(CmdGuardRule),
  audit: z.array(CmdGuardAuditEntry),
})
export type CmdGuardGetResponse = z.infer<typeof CmdGuardGetResponse>

export const CmdGuardSetRulesRequest = z.object({
  rules: z.array(CmdGuardRule),
})
export type CmdGuardSetRulesRequest = z.infer<typeof CmdGuardSetRulesRequest>

export const CmdGuardAppendAuditRequest = z.object({
  cmd: z.string().max(10_000),
  ruleId: z.string(),
  decision: CmdGuardDecision,
})
export type CmdGuardAppendAuditRequest = z.infer<typeof CmdGuardAppendAuditRequest>

export const DEFAULT_CMD_GUARD_RULES: CmdGuardRule[] = [
  {
    id: 'sudo',
    pattern: '^\\s*sudo\\b',
    description: 'Privileged command (sudo)',
    enabled: true,
  },
  {
    id: 'rm-rf',
    pattern: '\\brm\\s+-rf\\b',
    description: 'Recursive force delete (rm -rf)',
    enabled: true,
  },
  {
    id: 'curl-pipe-sh',
    pattern: '\\bcurl\\b.*\\|\\s*(sh|bash|zsh)\\b',
    description: 'Pipe-to-shell from curl (curl … | sh)',
    enabled: true,
  },
  {
    id: 'wget-pipe-sh',
    pattern: '\\bwget\\b.*\\|\\s*(sh|bash|zsh)\\b',
    description: 'Pipe-to-shell from wget (wget … | sh)',
    enabled: true,
  },
  {
    id: 'chmod-777',
    pattern: '\\bchmod\\s+(777|a\\+w)\\b',
    description: 'World-writable permissions (chmod 777)',
    enabled: true,
  },
  {
    id: 'dd-if',
    pattern: '\\bdd\\s+if=',
    description: 'Block-level write (dd if=…)',
    enabled: true,
  },
]
