import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fsp, writeFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

interface MockShape {
  byWorkspace: Record<string, unknown>
}

const stateBySlot: Record<string, MockShape> = {}

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      private readonly slot: string
      constructor(opts: { name: string }) {
        this.slot = opts.name
        stateBySlot[this.slot] ??= { byWorkspace: {} }
      }
      get<K extends keyof MockShape>(key: K, fallback?: unknown): unknown {
        return (stateBySlot[this.slot]?.[key] ?? fallback) as unknown
      }
      set<K extends keyof MockShape>(key: K, value: MockShape[K]): void {
        const cur = stateBySlot[this.slot] ?? { byWorkspace: {} }
        ;(cur as unknown as Record<string, unknown>)[key as string] = value
        stateBySlot[this.slot] = cur
      }
    },
  }
})

const W1 = '550e8400-e29b-41d4-a716-446655440001'
const W2 = '550e8400-e29b-41d4-a716-446655440002'

let workDir: string

beforeEach(async () => {
  workDir = await fsp.mkdtemp(join(tmpdir(), 'supatty-store-'))
  for (const k of Object.keys(stateBySlot)) delete stateBySlot[k]
})

afterEach(async () => {
  await fsp.rm(workDir, { recursive: true, force: true })
})

function writeLegacy(payload: unknown): string {
  const path = join(workDir, 'sessions-snapshot.json')
  writeFileSync(path, JSON.stringify(payload), 'utf8')
  return path
}

describe('SupaTTYStore — legacy migration', () => {
  it('migrates a well-formed legacy envelope and renames the file to .bak', async () => {
    const legacyPath = writeLegacy({
      envelope: {
        entries: [
          { workspaceId: W1, type: 'shell', label: 'pwsh' },
          { workspaceId: W1, type: 'claude', label: 'plan' },
          { workspaceId: W2, type: 'shell', label: 'bash' },
        ],
        savedAt: 1700000000000,
      },
    })

    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })

    expect(store.get(W1).sessions).toEqual([
      { type: 'shell', label: 'pwsh' },
      { type: 'claude', label: 'plan' },
    ])
    expect(store.get(W2).sessions).toEqual([{ type: 'shell', label: 'bash' }])
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}.bak`)).toBe(true)
  })

  it('is idempotent: a second construction does not re-migrate over existing data', async () => {
    writeLegacy({
      envelope: {
        entries: [{ workspaceId: W1, type: 'shell', label: 'first' }],
        savedAt: 1,
      },
    })

    const { SupaTTYStore } = await import('./SupaTTYStore')
    const a = new SupaTTYStore({ userDataDir: workDir })
    expect(a.get(W1).sessions).toHaveLength(1)

    // Even if a fresh legacy file somehow appeared again, an existing
    // envelope in the supatty slot must short-circuit the migration.
    writeLegacy({
      envelope: {
        entries: [
          { workspaceId: W1, type: 'shell', label: 'a' },
          { workspaceId: W1, type: 'shell', label: 'b' },
        ],
        savedAt: 2,
      },
    })
    const b = new SupaTTYStore({ userDataDir: workDir })
    expect(b.get(W1).sessions).toEqual([{ type: 'shell', label: 'first' }])
  })

  it('quarantines a corrupt legacy file as .bak.corrupt and yields an empty store', async () => {
    const legacyPath = join(workDir, 'sessions-snapshot.json')
    writeFileSync(legacyPath, '{ this is not json', 'utf8')

    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })

    expect(store.all().byWorkspace).toEqual({})
    expect(existsSync(legacyPath)).toBe(false)
    expect(existsSync(`${legacyPath}.bak.corrupt`)).toBe(true)
  })

  it('treats a missing legacy file as a no-op (fresh install)', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    expect(store.all().byWorkspace).toEqual({})
  })
})

describe('SupaTTYStore — runtime API', () => {
  it('saveAllFromFlat groups entries by workspace and preserves prior settings', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })

    // Seed settings on W1 to verify they survive a sessions rewrite.
    store.set(W1, { sessions: [], settings: { defaultShell: 'pwsh' } })
    store.saveAllFromFlat([
      { workspaceId: W1, type: 'shell', label: 'a' },
      { workspaceId: W1, type: 'claude', label: 'b' },
      { workspaceId: W2, type: 'shell', label: 'c' },
    ])
    expect(store.get(W1)).toEqual({
      sessions: [
        { type: 'shell', label: 'a' },
        { type: 'claude', label: 'b' },
      ],
      settings: { defaultShell: 'pwsh' },
    })
    expect(store.get(W2)).toEqual({ sessions: [{ type: 'shell', label: 'c' }] })
  })

  it('saveAllFromFlat keeps a workspace entry when sessions become empty if settings still exist', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    store.set(W1, { sessions: [{ type: 'shell', label: 'old' }], settings: { x: 1 } })
    store.saveAllFromFlat([]) // no live sessions anywhere
    expect(store.get(W1)).toEqual({ sessions: [], settings: { x: 1 } })
  })

  it('saveAllFromFlat drops workspaces with neither sessions nor settings', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    store.set(W1, { sessions: [{ type: 'shell', label: 'a' }] })
    store.saveAllFromFlat([])
    expect(W1 in store.all().byWorkspace).toBe(false)
  })

  it('lock() prevents saveAllFromFlat from overwriting (before-quit guarantee)', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    store.saveAllFromFlat([{ workspaceId: W1, type: 'shell', label: 'survives' }])
    store.lock()
    store.saveAllFromFlat([]) // would otherwise drop W1
    expect(store.get(W1).sessions).toEqual([{ type: 'shell', label: 'survives' }])
  })

  it('toFlatEntries reconstitutes the legacy flat list for the renderer', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    store.saveAllFromFlat([
      { workspaceId: W1, type: 'shell', label: 'a' },
      { workspaceId: W2, type: 'claude', label: 'b' },
    ])
    const flat = store.toFlatEntries()
    expect(flat).toHaveLength(2)
    expect(flat).toContainEqual({ workspaceId: W1, type: 'shell', label: 'a' })
    expect(flat).toContainEqual({ workspaceId: W2, type: 'claude', label: 'b' })
  })

  it('clearAllSessions empties sessions but keeps settings', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    store.set(W1, { sessions: [{ type: 'shell', label: 'a' }], settings: { theme: 'dark' } })
    store.set(W2, { sessions: [{ type: 'claude', label: 'b' }] })
    store.clearAllSessions()
    expect(store.get(W1)).toEqual({ sessions: [], settings: { theme: 'dark' } })
    expect(W2 in store.all().byWorkspace).toBe(false)
  })

  it('remove(workspaceId) deletes only the targeted workspace', async () => {
    const { SupaTTYStore } = await import('./SupaTTYStore')
    const store = new SupaTTYStore({ userDataDir: workDir })
    store.set(W1, { sessions: [{ type: 'shell', label: 'a' }] })
    store.set(W2, { sessions: [{ type: 'claude', label: 'b' }] })
    store.remove(W1)
    expect(W1 in store.all().byWorkspace).toBe(false)
    expect(store.get(W2).sessions).toEqual([{ type: 'claude', label: 'b' }])
  })
})
