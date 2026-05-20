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

  /** Home is pinned first; folder workspaces follow, most-recent first. */
  list(): Workspace[] {
    const all = [...this.store.get('workspaces', [])]
    const home = all.filter((w) => w.id === HOME_WORKSPACE_ID)
    const rest = all
      .filter((w) => w.id !== HOME_WORKSPACE_ID)
      .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
    return [...home, ...rest]
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
      const updated = { ...existing, lastOpenedAt: now }
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

  /** Home is permanent — removal requests for it are ignored. */
  remove(id: string): void {
    if (id === HOME_WORKSPACE_ID) return
    const next = this.store.get('workspaces', []).filter((w) => w.id !== id)
    this.store.set('workspaces', next)
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
