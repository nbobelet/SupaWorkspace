import { existsSync, readFileSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import {
  SupaTTYData,
  type LegacySessionSnapshotEntry,
  type SupaTTYSessionSnapshot,
} from '@shared/supatty'
import { SubAppStore, type LegacyMigrationResult } from '../sub-apps/SubAppStore'

const LEGACY_FILE = 'sessions-snapshot.json'

interface SupaTTYStoreOptions {
  /** Directory holding `sessions-snapshot.json` (electron `app.getPath('userData')`). */
  userDataDir: string
}

/**
 * Per-workspace SupaTTY store: terminal session snapshots + (future)
 * settings. Owns the migration from the v0 `sessions-snapshot.json`
 * envelope into the per-workspace `supatty.json` shape.
 */
export class SupaTTYStore extends SubAppStore<SupaTTYData> {
  constructor(opts: SupaTTYStoreOptions) {
    super({
      id: 'supatty',
      defaultValue: () => ({ sessions: [] }),
      schema: SupaTTYData,
      runLegacyMigration: () => migrateFromSessionsSnapshot(opts.userDataDir),
    })
  }

  /**
   * Replaces the snapshot of *all* workspaces from the flat list emitted
   * by `SessionManager`. Workspaces present in `entries` get their
   * `sessions` rewritten; workspaces absent from `entries` keep their
   * existing `settings` only — their sessions go to `[]` because the
   * SessionManager is the single source of truth for live tabs.
   * Workspaces with no sessions *and* no settings are dropped entirely
   * to avoid orphan entries piling up.
   */
  saveAllFromFlat(entries: LegacySessionSnapshotEntry[]): void {
    if (this.isLocked()) return
    const grouped = new Map<string, SupaTTYSessionSnapshot[]>()
    for (const e of entries) {
      const arr = grouped.get(e.workspaceId) ?? []
      arr.push({ type: e.type, label: e.label })
      grouped.set(e.workspaceId, arr)
    }
    const current = this.all().byWorkspace
    const next: Record<string, SupaTTYData> = {}
    const allIds = new Set<string>([...Object.keys(current), ...grouped.keys()])
    for (const wsId of allIds) {
      const sessions = grouped.get(wsId) ?? []
      const settings = current[wsId]?.settings
      if (sessions.length === 0 && settings === undefined) continue
      next[wsId] = settings === undefined ? { sessions } : { sessions, settings }
    }
    this.replaceAll(next)
  }

  /**
   * Reconstitutes the legacy `{ workspaceId, type, label }[]` envelope
   * the renderer still consumes via `session-snapshot:list`. The IPC
   * contract is unchanged for this iteration — only the storage shape
   * moved.
   */
  toFlatEntries(): LegacySessionSnapshotEntry[] {
    const out: LegacySessionSnapshotEntry[] = []
    const { byWorkspace } = this.all()
    for (const [workspaceId, data] of Object.entries(byWorkspace)) {
      for (const s of data.sessions) {
        out.push({ workspaceId, type: s.type, label: s.label })
      }
    }
    return out
  }

  /**
   * Drops every workspace's sessions (preserves settings). Wired into the
   * `session-snapshot:clear` IPC handler so the renderer's "Discard
   * snapshot" action keeps its v0 semantics.
   */
  clearAllSessions(): void {
    if (this.isLocked()) return
    const current = this.all().byWorkspace
    const next: Record<string, SupaTTYData> = {}
    for (const [wsId, data] of Object.entries(current)) {
      if (data.settings === undefined) continue
      next[wsId] = { sessions: [], settings: data.settings }
    }
    this.replaceAll(next)
  }
}

/**
 * One-shot read of `<userData>/sessions-snapshot.json` (the v0 envelope
 * `{ envelope: { entries: [{ workspaceId, type, label }], savedAt } }`).
 * Successful parse → groups entries by `workspaceId`, renames legacy to
 * `.bak`. Unreadable JSON → renames to `.bak.corrupt` for forensic and
 * returns null (target stays empty, `clearInvalidConfig` of electron-store
 * has already neutralised any direct read from the legacy path).
 *
 * Idempotence is guaranteed by `SubAppStore.maybeMigrate` — this function
 * is only called when the SupaTTY envelope is empty.
 */
function migrateFromSessionsSnapshot(
  userDataDir: string,
): LegacyMigrationResult<SupaTTYData> | null {
  const legacyPath = join(userDataDir, LEGACY_FILE)
  if (!existsSync(legacyPath)) return null

  let raw: string
  try {
    raw = readFileSync(legacyPath, 'utf8')
  } catch (err) {
    console.warn(`[supatty] legacy read failed at ${legacyPath}:`, err)
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.warn(
      `[supatty] legacy ${LEGACY_FILE} unreadable, preserving as .bak.corrupt:`,
      err,
    )
    try {
      renameSync(legacyPath, `${legacyPath}.bak.corrupt`)
    } catch {
      // best-effort
    }
    return null
  }

  const envelope =
    (parsed as { envelope?: { entries?: unknown } } | null)?.envelope ?? null
  const entries = Array.isArray(envelope?.entries) ? envelope.entries : []
  const byWorkspace: Record<string, SupaTTYData> = {}
  let migratedCount = 0
  for (const e of entries as unknown[]) {
    if (typeof e !== 'object' || e === null) continue
    const obj = e as { workspaceId?: unknown; type?: unknown; label?: unknown }
    if (
      typeof obj.workspaceId !== 'string' ||
      typeof obj.type !== 'string' ||
      typeof obj.label !== 'string'
    ) {
      continue
    }
    if (obj.type !== 'claude' && obj.type !== 'shell') continue
    const list = byWorkspace[obj.workspaceId] ?? { sessions: [] }
    list.sessions.push({ type: obj.type, label: obj.label })
    byWorkspace[obj.workspaceId] = list
    migratedCount += 1
  }

  try {
    renameSync(legacyPath, `${legacyPath}.bak`)
  } catch (err) {
    console.warn(`[supatty] could not rename legacy to .bak:`, err)
  }

  return {
    byWorkspace,
    migratedCount,
    sourceLabel: LEGACY_FILE,
  }
}
