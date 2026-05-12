import { z } from 'zod'
import { SessionType } from './session'

export const SessionSnapshot = z.object({
  workspaceId: z.string().uuid(),
  type: SessionType,
  label: z.string(),
})
export type SessionSnapshot = z.infer<typeof SessionSnapshot>

export const SessionSnapshotEnvelope = z.object({
  entries: z.array(SessionSnapshot),
  savedAt: z.number().int(),
})
export type SessionSnapshotEnvelope = z.infer<typeof SessionSnapshotEnvelope>

export const SessionSnapshotListResponse = z.object({
  envelope: SessionSnapshotEnvelope,
})
export type SessionSnapshotListResponse = z.infer<typeof SessionSnapshotListResponse>

export const SessionSnapshotClearResponse = z.object({
  cleared: z.boolean(),
})
export type SessionSnapshotClearResponse = z.infer<typeof SessionSnapshotClearResponse>
