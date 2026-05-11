import { z } from 'zod'

export const NotificationKind = z.enum(['waiting', 'finished', 'error'])
export type NotificationKind = z.infer<typeof NotificationKind>

export const NotificationPushEvent = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid(),
  sessionLabel: z.string(),
  workspaceName: z.string(),
  kind: NotificationKind,
  ts: z.number().int(),
})
export type NotificationPushEvent = z.infer<typeof NotificationPushEvent>
