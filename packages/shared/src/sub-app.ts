import { z } from 'zod'

/**
 * Stable identifier for a sub-app slot inside a Workspace. Each entry maps
 * 1:1 with a `<slot>.json` file under userData and a dedicated `SubAppStore`
 * subclass on the main side. Adding a new sub-app = new entry here +
 * matching domain types + a store wired into `index.ts`.
 */
export const SubAppId = z.enum(['supatty', 'notes', 'dashboard', 'explorer'])
export type SubAppId = z.infer<typeof SubAppId>

/**
 * Envelope shape every sub-app store persists in `<slot>.json`.
 * Indexed by workspace id so each Workspace owns its own isolated payload
 * for this sub-app; an unknown workspace id simply yields the sub-app's
 * default value (resolved by the consumer, never persisted as `null`).
 */
export const SubAppEnvelope = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    byWorkspace: z.record(z.string().uuid(), dataSchema),
  })

export type SubAppEnvelopeShape<T> = { byWorkspace: Record<string, T> }
