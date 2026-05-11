import { randomUUID } from 'node:crypto'
import { basename } from 'node:path'
import { existsSync } from 'node:fs'
import Store from 'electron-store'
import type { PathGrant, Workspace, WorkspacePermissions } from '@shared/workspace'
import { pickWorkspaceHue } from './pickWorkspaceHue'

interface StoreShape {
  workspaces: Workspace[]
}

const defaultPermissions = (): WorkspacePermissions => ({ extraPaths: [], allow: [], deny: [] })

export class WorkspaceStore {
  private readonly store: Store<StoreShape>

  constructor() {
    this.store = new Store<StoreShape>({
      name: 'workspaces',
      defaults: { workspaces: [] },
      clearInvalidConfig: true,
    })
  }

  list(): Workspace[] {
    return [...this.store.get('workspaces', [])].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
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
      rootPath,
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

  remove(id: string): void {
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
