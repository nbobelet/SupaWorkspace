import { z } from 'zod'

export const NotificationKind = z.enum([
  'request-complete',
  'user-input-required',
  'permission-prompt',
  'error',
  'task-completed',
])
export type NotificationKind = z.infer<typeof NotificationKind>

export const NotificationPushEvent = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
  sessionLabel: z.string().optional(),
  workspaceName: z.string(),
  kind: NotificationKind,
  ts: z.number().int(),
  detail: z.string().optional(),
})
export type NotificationPushEvent = z.infer<typeof NotificationPushEvent>
