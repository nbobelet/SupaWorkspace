import { describe, expect, it, vi, beforeEach } from 'vitest'

interface MockData {
  envelope: { entries: Array<{ workspaceId: string; type: string; label: string }>; savedAt: number }
}

const data: MockData = { envelope: { entries: [], savedAt: 0 } }

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      get<T>(key: keyof MockData, fallback?: T): T {
        return (data[key] as unknown as T) ?? (fallback as T)
      }
      set<T>(key: keyof MockData, value: T): void {
        ;(data as unknown as Record<string, T>)[key] = value
      }
    },
  }
})

beforeEach(() => {
  data.envelope = { entries: [], savedAt: 0 }
})

describe('SessionSnapshotStore', () => {
  it('saves entries with a timestamp', async () => {
    const { SessionSnapshotStore } = await import('./SessionSnapshotStore')
    const store = new SessionSnapshotStore()
    const before = Date.now()
    store.save([
      { workspaceId: '550e8400-e29b-41d4-a716-446655440001', type: 'shell', label: 'pwsh' },
    ])
    const env = store.get()
    expect(env.entries).toHaveLength(1)
    expect(env.savedAt).toBeGreaterThanOrEqual(before)
  })

  it('lock() prevents subsequent saves', async () => {
    const { SessionSnapshotStore } = await import('./SessionSnapshotStore')
    const store = new SessionSnapshotStore()
    store.save([
      { workspaceId: '550e8400-e29b-41d4-a716-446655440001', type: 'shell', label: 'a' },
    ])
    store.lock()
    store.save([])
    expect(store.get().entries).toHaveLength(1)
    expect(store.get().entries[0]?.label).toBe('a')
  })

  it('clear() resets the envelope to empty', async () => {
    const { SessionSnapshotStore } = await import('./SessionSnapshotStore')
    const store = new SessionSnapshotStore()
    store.save([
      { workspaceId: '550e8400-e29b-41d4-a716-446655440001', type: 'shell', label: 'a' },
    ])
    store.clear()
    expect(store.get().entries).toEqual([])
  })
})
