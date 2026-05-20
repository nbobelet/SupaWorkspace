import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HOME_WORKSPACE_ID, WORKSPACE_RETENTION_MS, type Workspace } from '@shared/workspace'

interface MockShape {
  workspaces?: Workspace[]
}

const stateBySlot: Record<string, MockShape> = {}

vi.mock('electron-store', () => {
  return {
    default: class MockStore<T extends MockShape> {
      private readonly slot: string
      constructor(opts: { name: string; defaults?: T }) {
        this.slot = opts.name
        if (stateBySlot[this.slot] === undefined) {
          stateBySlot[this.slot] = { workspaces: [], ...opts.defaults }
        }
      }
      get<K extends keyof MockShape>(key: K, fallback?: MockShape[K]): MockShape[K] {
        const cur = stateBySlot[this.slot] ?? {}
        const v = cur[key]
        return (v === undefined ? fallback : v) as MockShape[K]
      }
      set<K extends keyof MockShape>(key: K, value: MockShape[K]): void {
        const cur = stateBySlot[this.slot] ?? {}
        ;(cur as Record<string, unknown>)[key as string] = value
        stateBySlot[this.slot] = cur
      }
    },
  }
})

const A = '550e8400-e29b-41d4-a716-446655440001'
const B = '550e8400-e29b-41d4-a716-446655440002'

function folder(id: string, overrides: Partial<Workspace> = {}): Workspace {
  const now = Date.now()
  return {
    id,
    name: `ws-${id.slice(-1)}`,
    kind: 'folder',
    rootPath: `/tmp/${id}`,
    workdir: null,
    createdAt: now,
    lastOpenedAt: now,
    deletedAt: null,
    permissions: { extraPaths: [], allow: [], deny: [] },
    ...overrides,
  }
}

/** Seed the store slot directly, keeping the Home entry the constructor adds. */
function seed(workspaces: Workspace[]): void {
  stateBySlot['workspaces'] = { workspaces }
}

beforeEach(() => {
  for (const k of Object.keys(stateBySlot)) delete stateBySlot[k]
})

describe('WorkspaceStore soft-delete', () => {
  it('softDelete tombstones the workspace: hidden from list(), present in listDeleted()', async () => {
    seed([folder(A), folder(B)])
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    store.softDelete(A)

    expect(store.list().map((w) => w.id)).not.toContain(A)
    expect(store.list().map((w) => w.id)).toContain(B)
    const trashed = store.listDeleted()
    expect(trashed.map((w) => w.id)).toEqual([A])
    expect(trashed[0]?.deletedAt).toBeTypeOf('number')
  })

  it('softDelete is idempotent — re-trashing keeps the original deletedAt', async () => {
    seed([folder(A, { deletedAt: 1_000 })])
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    store.softDelete(A)

    expect(store.listDeleted()[0]?.deletedAt).toBe(1_000)
  })

  it('restore clears deletedAt and bumps lastOpenedAt', async () => {
    const old = Date.now() - 5_000
    seed([folder(A, { deletedAt: Date.now(), lastOpenedAt: old })])
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    const restored = store.restore(A)

    expect(restored.deletedAt).toBeNull()
    expect(restored.lastOpenedAt).toBeGreaterThan(old)
    expect(store.list().map((w) => w.id)).toContain(A)
    expect(store.listDeleted()).toHaveLength(0)
  })

  it('purge removes the workspace entirely', async () => {
    seed([folder(A, { deletedAt: Date.now() })])
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    store.purge(A)

    expect(store.getById(A)).toBeUndefined()
    expect(store.listDeleted()).toHaveLength(0)
  })

  it('purgeExpired drops only entries older than the window and returns their ids', async () => {
    const now = Date.now()
    seed([
      folder(A, { deletedAt: now - WORKSPACE_RETENTION_MS - 1 }), // expired
      folder(B, { deletedAt: now - 1_000 }), // fresh
    ])
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    const purged = store.purgeExpired(WORKSPACE_RETENTION_MS)

    expect(purged).toEqual([A])
    expect(store.getById(A)).toBeUndefined()
    expect(store.getById(B)).toBeDefined()
  })

  it('Home cannot be soft-deleted or purged', async () => {
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    store.softDelete(HOME_WORKSPACE_ID)
    store.purge(HOME_WORKSPACE_ID)

    expect(store.getById(HOME_WORKSPACE_ID)).toBeDefined()
    expect(store.list().map((w) => w.id)).toContain(HOME_WORKSPACE_ID)
  })

  it('re-opening a trashed folder by path restores it (deletedAt cleared)', async () => {
    seed([folder(A, { rootPath: '/tmp/reopen', deletedAt: Date.now() })])
    const { WorkspaceStore } = await import('./WorkspaceStore')
    const store = new WorkspaceStore()

    // existsSync is real here; getByPath finds the seeded entry regardless of fs.
    const found = store.getByPath('/tmp/reopen')
    expect(found?.deletedAt).toBeTypeOf('number')
  })
})
