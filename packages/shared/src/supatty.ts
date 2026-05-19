import { z } from 'zod'
import { SessionType } from './session'

/**
 * One PTY session as persisted by the SupaTTY sub-app. Mirrors the prior
 * `SessionSnapshot` shape so the legacy `sessions-snapshot.json` envelope
 * can be migrated 1:1 — `workspaceId` is dropped here because it is
 * implicit in the byWorkspace indexing of the SupaTTY envelope.
 */
export const SupaTTYSessionSnapshot = z.object({
  type: SessionType,
  label: z.string(),
})
export type SupaTTYSessionSnapshot = z.infer<typeof SupaTTYSessionSnapshot>

/**
 * Per-workspace SupaTTY payload. `sessions` is the snapshot used to rebuild
 * tabs at boot. `settings` is reserved for future per-SupaTTY preferences
 * (default shell, prompt, font override, ...) — kept as a free object today
 * so adding keys is a non-breaking schema change.
 */
export const SupaTTYSettings = z.object({}).passthrough()
export type SupaTTYSettings = z.infer<typeof SupaTTYSettings>

export const SupaTTYData = z.object({
  sessions: z.array(SupaTTYSessionSnapshot),
  settings: SupaTTYSettings.optional(),
})
export type SupaTTYData = z.infer<typeof SupaTTYData>

/**
 * Bridge type for the legacy IPC channel `session-snapshot:list` — the
 * renderer still consumes the flat `{ workspaceId, type, label }[]` shape,
 * so the main side reconstitutes it from the SupaTTY byWorkspace map.
 */
export interface LegacySessionSnapshotEntry {
  workspaceId: string
  type: SupaTTYSessionSnapshot['type']
  label: string
}
