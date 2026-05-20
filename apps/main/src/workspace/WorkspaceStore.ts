import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { existsSync } from 'node:fs'
import Store from 'electron-store'
import {
  HOME_WORKSPACE_ID,
  HOME_WORKSPACE_NAME,
  type PathGrant,
  type Workspace,
  type WorkspacePermissions,
} from '@shared/workspace'
import { pickWorkspaceHue } from './pickWorkspaceHue'

interface StoreShape {
  workspaces: Workspace[]
}

const defaultPermissions = (): WorkspacePermissions => ({ extraPaths: [], allow: [], deny: [] })

function makeHomeWorkspace(now: number): Workspace {
  return {
    id: HOME_WORKSPACE_ID,
    name: HOME_WORKSPACE_NAME,
    kind: 'home',
    rootPath: null,
    workdir: null,
    createdAt: now,
    lastOpenedAt: now,
    deletedAt: null,
    permissions: defaultPermissions(),
  }
}

export class WorkspaceStore {
  private readonly store: Store<StoreShape>

  constructor() {
    this.store = new Store<StoreShape>({
      name: 'workspaces',
      defaults: { workspaces: [] },
      clearInvalidConfig: true,
    })
    this.ensureHome()
  }

  /** Seed the singleton Home workspace if absent. Idempotent. */
  private ensureHome(): void {
    const all = this.store.get('workspaces', [])
    if (all.some((w) => w.id === HOME_WORKSPACE_ID)) return
    this.store.set('workspaces', [makeHomeWorkspace(Date.now()), ...all])
  }

  /**
   * Active workspaces only (soft-deleted entries excluded). Home is pinned
   * first; folder workspaces follow, most-recent first.
   */
  list(): Workspace[] {
    const all = [...this.store.get('workspaces', [])].filter((w) => w.deletedAt == null)
    const home = all.filter((w) => w.id === HOME_WORKSPACE_ID)
    const rest = all
      .filter((w) => w.id !== HOME_WORKSPACE_ID)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    return [...home, ...rest]
  }

  /** Soft-deleted workspaces (the trash), most-recently-deleted first. */
  listDeleted(): Workspace[] {
    return [...this.store.get('workspaces', [])]
      .filter((w): w is Workspace & { deletedAt: number } => w.deletedAt != null)
      .sort((a, b) => b.deletedAt - a.deletedAt)
  }

  getById(id: string): Workspace | undefined {
    return this.store.get('workspaces', []).find((w) => w.id === id)
  }

  getByPath(rootPath: string): Workspace | undefined {
    return this.store.get('workspaces', []).find((w) => w.rootPath === rootPath)
  }

  openOrCreate(rootPath: string): { workspace: Workspace; wasExisting: boolean } {
    if (!existsSync(rootPath)) {
      throw new Error(`Workspace path does not exist: ${rootPath}`)
    }
    const existing = this.getByPath(rootPath)
    const now = Date.now()
    if (existing) {
      // Re-opening a trashed folder restores it (clears the tombstone) — this
      // is the "recover via Open Workspace" path; the retention timer resets.
      const updated = { ...existing, lastOpenedAt: now, deletedAt: null }
      this.replace(updated)
      return { workspace: updated, wasExisting: true }
    }
    const existingHues = this.store
      .get('workspaces', [])
      .map((w) => w.color?.hue)
      .filter((h): h is number => typeof h === 'number')
    const workspace: Workspace = {
      id: randomUUID(),
      name: basename(rootPath),
      kind: 'folder',
      rootPath,
      workdir: null,
      createdAt: now,
      lastOpenedAt: now,
      deletedAt: null,
      permissions: defaultPermissions(),
      color: { hue: pickWorkspaceHue(existingHues) },
    }
    this.store.set('workspaces', [...this.store.get('workspaces', []), workspace])
    return { workspace, wasExisting: false }
  }

  rename(id: string, name: string): Workspace {
    const ws = this.getById(id)
    if (!ws) throw new Error(`Workspace not found: ${id}`)
    const updated = { ...ws, name }
    this.replace(updated)
    return updated
  }

  setColor(id: string, hue: number): Workspace {
    const ws = this.getById(id)
    if (!ws) throw new Error(`Workspace not found: ${id}`)
    const updated: Workspace = { ...ws, color: { hue } }
    this.replace(updated)
    return updated
  }

  /** Sets the cwd hint (no scope grant). `null` clears it. */
  setWorkdir(id: string, workdir: string | null): Workspace {
    const ws = this.getById(id)
    if (!ws) throw new Error(`Workspace not found: ${id}`)
    const updated: Workspace = { ...ws, workdir }
    this.replace(updated)
    return updated
  }

  /**
   * Soft delete — tombstones the workspace so it leaves the active list but
   * keeps its row (and all sub-app data) for recovery. Home is permanent, so
   * requests for it are ignored. Idempotent: re-trashing keeps the first
   * `deletedAt` so the retention countdown is not extended by repeat calls.
   */
  softDelete(id: string): void {
    if (id === HOME_WORKSPACE_ID) return
    const ws = this.getById(id)
    if (!ws || ws.deletedAt != null) return
    this.replace({ ...ws, deletedAt: Date.now() })
  }

  /** Restore a trashed workspace to the active list; resets the timer. */
  restore(id: string): Workspace {
    const ws = this.getById(id)
    if (!ws) throw new Error(`Workspace not found: ${id}`)
    const updated: Workspace = { ...ws, deletedAt: null, lastOpenedAt: Date.now() }
    this.replace(updated)
    return updated
  }

  /** Permanent, irreversible delete. Home is permanent — requests are ignored. */
  purge(id: string): void {
    if (id === HOME_WORKSPACE_ID) return
    const next = this.store.get('workspaces', []).filter((w) => w.id !== id)
    this.store.set('workspaces', next)
  }

  /**
   * Drop soft-deleted workspaces older than `maxAgeMs`. Returns the purged ids
   * so the caller can cascade sub-app cleanup (notes/todo/supatty) — this store
   * owns only workspace metadata. Run once on boot.
   */
  purgeExpired(maxAgeMs: number): string[] {
    const now = Date.now()
    const all = this.store.get('workspaces', [])
    const expired = all.filter((w) => w.deletedAt != null && w.deletedAt + maxAgeMs < now)
    if (expired.length === 0) return []
    const expiredIds = new Set(expired.map((w) => w.id))
    this.store.set(
      'workspaces',
      all.filter((w) => !expiredIds.has(w.id)),
    )
    return [...expiredIds]
  }

  findGrantConflicts(): Array<{
    path: string
    workspaces: Array<{ id: string; name: string; kind: 'read' | 'write' }>
  }> {
    const byPath = new Map<string, Array<{ id: string; name: string; kind: 'read' | 'write' }>>()
    for (const ws of this.store.get('workspaces', [])) {
      for (const grant of ws.permissions.extraPaths) {
        const list = byPath.get(grant.path) ?? []
        list.push({ id: ws.id, name: ws.name, kind: grant.kind })
        byPath.set(grant.path, list)
      }
    }
    const conflicts: Array<{
      path: string
      workspaces: Array<{ id: string; name: string; kind: 'read' | 'write' }>
    }> = []
    for (const [path, workspaces] of byPath) {
      if (workspaces.length > 1) {
        conflicts.push({ path, workspaces })
      }
    }
    return conflicts
  }

  addPathGrant(id: string, grant: PathGrant): Workspace {
    const ws = this.getById(id)
    if (!ws) throw new Error(`Workspace not found: ${id}`)
    const existing = ws.permissions.extraPaths.find((p) => p.path === grant.path)
    const extraPaths = existing
      ? ws.permissions.extraPaths.map((p) => (p.path === grant.path ? grant : p))
      : [...ws.permissions.extraPaths, grant]
    const updated: Workspace = { ...ws, permissions: { ...ws.permissions, extraPaths } }
    this.replace(updated)
    return updated
  }

  revokePathGrant(id: string, path: string): Workspace {
    const ws = this.getById(id)
    if (!ws) throw new Error(`Workspace not found: ${id}`)
    const extraPaths = ws.permissions.extraPaths.filter((p) => p.path !== path)
    const updated: Workspace = { ...ws, permissions: { ...ws.permissions, extraPaths } }
    this.replace(updated)
    return updated
  }

  private replace(ws: Workspace): void {
    const next = this.store
      .get('workspaces', [])
      .map((existing) => (existing.id === ws.id ? ws : existing))
    this.store.set('workspaces', next)
  }
}
