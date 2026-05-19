import Store from 'electron-store'
import type { z } from 'zod'
import type { SubAppEnvelopeShape, SubAppId } from '@shared/sub-app'

/**
 * Outcome of a one-shot legacy migration. The base class invokes
 * `runLegacyMigration` exactly once at boot, *only* when the target store
 * is empty — that is the idempotence guard. Returning `null` means
 * "nothing to migrate", which is also the steady state once `.bak` files
 * have been renamed.
 */
export interface LegacyMigrationResult<TData> {
  byWorkspace: Record<string, TData>
  migratedCount: number
  sourceLabel: string
}

export interface SubAppStoreOptions<TData> {
  /** Stable file name (without extension) under userData. */
  id: SubAppId
  /** Returned by `get()` when a workspace has no entry yet. */
  defaultValue: () => TData
  /**
   * Zod schema for one workspace's payload. Validated on `set()` so a
   * malformed write never lands on disk. The full envelope is dropped at
   * boot if electron-store's parse fails — see `clearInvalidConfig`.
   */
  schema: z.ZodType<TData>
  /**
   * Optional one-shot bridge from a previous storage format. Only invoked
   * when this store's envelope is empty (no `byWorkspace` entries). The
   * implementation is responsible for renaming/backing-up its legacy
   * source file so the migration doesn't run again after a future
   * `remove`.
   */
  runLegacyMigration?: () => LegacyMigrationResult<TData> | null
}

interface StoreShape<TData> {
  byWorkspace: Record<string, TData>
}

/**
 * Generic per-workspace store backing one sub-app slot. Files live
 * alongside `workspaces.json` (electron-store conventions), shape is
 * always `{ byWorkspace: Record<workspaceId, TData> }` so a new sub-app is
 * just a new file + new subclass.
 */
export class SubAppStore<TData> {
  protected readonly store: Store<StoreShape<TData>>
  protected readonly options: SubAppStoreOptions<TData>
  private locked = false

  constructor(options: SubAppStoreOptions<TData>) {
    this.options = options
    this.store = new Store<StoreShape<TData>>({
      name: options.id,
      defaults: { byWorkspace: {} },
      clearInvalidConfig: true,
    })
    this.maybeMigrate()
  }

  get(workspaceId: string): TData {
    const byWorkspace = this.store.get('byWorkspace', {})
    const entry = byWorkspace[workspaceId]
    return entry === undefined ? this.options.defaultValue() : entry
  }

  set(workspaceId: string, data: TData): void {
    if (this.locked) return
    const parsed = this.options.schema.parse(data)
    const byWorkspace = this.store.get('byWorkspace', {})
    this.store.set('byWorkspace', { ...byWorkspace, [workspaceId]: parsed })
  }

  remove(workspaceId: string): void {
    if (this.locked) return
    const byWorkspace = this.store.get('byWorkspace', {})
    if (!(workspaceId in byWorkspace)) return
    const next = { ...byWorkspace }
    delete next[workspaceId]
    this.store.set('byWorkspace', next)
  }

  all(): SubAppEnvelopeShape<TData> {
    return { byWorkspace: this.store.get('byWorkspace', {}) }
  }

  /**
   * Bulk replacement of the whole `byWorkspace` map. Each value is
   * validated by the configured schema before the write lands — a single
   * invalid entry rejects the whole batch. Used by callers that need to
   * reconcile derived state in one shot (e.g. SupaTTY rebuilding its map
   * from the live SessionManager).
   */
  replaceAll(byWorkspace: Record<string, TData>): void {
    if (this.locked) return
    const validated: Record<string, TData> = {}
    for (const [k, v] of Object.entries(byWorkspace)) {
      validated[k] = this.options.schema.parse(v)
    }
    this.store.set('byWorkspace', validated)
  }

  /**
   * Freezes writes for the rest of the process lifetime. Used during the
   * Electron `before-quit` window when `sessionManager.killAll()` would
   * otherwise overwrite a fresh snapshot with the post-kill empty state.
   */
  lock(): void {
    this.locked = true
  }

  isLocked(): boolean {
    return this.locked
  }

  private maybeMigrate(): void {
    if (this.options.runLegacyMigration === undefined) return
    const current = this.store.get('byWorkspace', {})
    if (Object.keys(current).length > 0) return
    const result = this.options.runLegacyMigration()
    if (result === null) return
    this.store.set('byWorkspace', result.byWorkspace)
    console.log(
      `[sub-app:${this.options.id}] migrated ${result.migratedCount} entries from ${result.sourceLabel}`,
    )
  }
}
