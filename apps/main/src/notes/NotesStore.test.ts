import { beforeEach, describe, expect, it, vi } from 'vitest'

interface MockShape {
  byWorkspace?: Record<string, string>
  userNotes?: string
}

const stateBySlot: Record<string, MockShape> = {}

vi.mock('electron-store', () => {
  return {
    default: class MockStore<T extends MockShape> {
      private readonly slot: string
      constructor(opts: { name: string; defaults?: T }) {
        this.slot = opts.name
        if (stateBySlot[this.slot] === undefined) {
          stateBySlot[this.slot] = { byWorkspace: {}, ...opts.defaults }
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
      delete(key: keyof MockShape): void {
        const cur = stateBySlot[this.slot] ?? {}
        delete cur[key]
        stateBySlot[this.slot] = cur
      }
    },
  }
})

const W1 = '550e8400-e29b-41d4-a716-446655440001'
const W2 = '550e8400-e29b-41d4-a716-446655440002'

beforeEach(() => {
  for (const k of Object.keys(stateBySlot)) delete stateBySlot[k]
})

describe('NotesStore', () => {
  it('returns empty string for a workspace with no notes', async () => {
    const { NotesStore } = await import('./NotesStore')
    const store = new NotesStore()
    expect(store.get(W1)).toBe('')
  })

  it('round-trips per-workspace content', async () => {
    const { NotesStore } = await import('./NotesStore')
    const store = new NotesStore()
    store.set(W1, 'hello')
    store.set(W2, 'world')
    expect(store.get(W1)).toBe('hello')
    expect(store.get(W2)).toBe('world')
  })

  it('drains legacy userNotes into the first workspace that asks for its notes', async () => {
    stateBySlot['notes'] = { byWorkspace: {}, userNotes: 'old single-string note' }
    const { NotesStore } = await import('./NotesStore')
    const store = new NotesStore()
    expect(store.get(W1)).toBe('old single-string note')
    expect(stateBySlot['notes']?.userNotes).toBeUndefined()
    expect(stateBySlot['notes']?.byWorkspace?.[W1]).toBe('old single-string note')
  })

  it('does not drain legacy userNotes if byWorkspace already has any entry', async () => {
    stateBySlot['notes'] = {
      byWorkspace: { [W2]: 'kept' },
      userNotes: 'should not migrate',
    }
    const { NotesStore } = await import('./NotesStore')
    const store = new NotesStore()
    expect(store.get(W1)).toBe('')
    expect(stateBySlot['notes']?.userNotes).toBe('should not migrate')
  })

  it('drain runs at most once even across multiple get() calls', async () => {
    stateBySlot['notes'] = { byWorkspace: {}, userNotes: 'one-shot' }
    const { NotesStore } = await import('./NotesStore')
    const store = new NotesStore()
    expect(store.get(W1)).toBe('one-shot')
    // Simulate the file gaining a userNotes again — drain must not re-fire.
    stateBySlot['notes']!.userNotes = 'should-not-resurrect'
    expect(store.get(W2)).toBe('')
    expect(stateBySlot['notes']?.userNotes).toBe('should-not-resurrect')
  })

  it('remove(workspaceId) drops only the targeted workspace', async () => {
    const { NotesStore } = await import('./NotesStore')
    const store = new NotesStore()
    store.set(W1, 'a')
    store.set(W2, 'b')
    store.remove(W1)
    expect(store.get(W1)).toBe('')
    expect(store.get(W2)).toBe('b')
  })
})
