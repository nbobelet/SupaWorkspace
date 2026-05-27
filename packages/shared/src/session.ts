import { z } from 'zod'

export const SessionType = z.enum(['claude', 'shell', 'wsl'])
export type SessionType = z.infer<typeof SessionType>

export const SessionState = z.enum(['idle', 'running', 'asking', 'done', 'ending'])
export type SessionState = z.infer<typeof SessionState>

export const SessionConfig = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  type: SessionType,
  label: z.string(),
  cwd: z.string(),
  createdAt: z.number().int(),
})
export type SessionConfig = z.infer<typeof SessionConfig>
