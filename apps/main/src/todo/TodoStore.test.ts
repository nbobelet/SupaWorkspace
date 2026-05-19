import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TODO_SCHEMA_VERSION } from '@shared/todo'

interface MockShape {
  byWorkspace?: Record<string, unknown>
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
const TASK1 = '550e8400-e29b-41d4-a716-4466554400aa'

function legacyColumns(): unknown[] {
  return [
    { id: 'created', name: 'Created', color: '#94a3b8', order: 0, builtin: true },
    { id: 'archive', name: 'Archive', color: '#64748b', order: 1, builtin: true },
  ]
}

beforeEach(() => {
  for (const k of Object.keys(stateBySlot)) delete stateBySlot[k]
})

describe('TodoStore v1 -> v2 migration', () => {
  it('backfills createdAt = dateStarted for a legacy task that has no createdAt', async () => {
    stateBySlot['todo'] = {
      byWorkspace: {
        [W1]: {
          schemaVersion: 1,
          columns: legacyColumns(),
          tasks: [
            {
              kind: 'todo',
              id: TASK1,
              title: 'legacy task',
              description: '',
              columnId: 'created',
              dateStarted: 1000,
              dateDone: null,
              dateArchive: null,
              severity: null,
              deadline: null,
            },
          ],
          columnOrder: { created: [TASK1], archive: [] },
        },
      },
    }

    const { TodoStore } = await import('./TodoStore')
    const store = new TodoStore()
    const state = store.get(W1)

    expect(state.schemaVersion).toBe(TODO_SCHEMA_VERSION)
    const task = state.tasks.find((t) => t.id === TASK1)
    expect(task?.createdAt).toBe(1000)
  })

  it('moves an orphan task (missing column) to archive without dropping it, and still backfills createdAt', async () => {
    stateBySlot['todo'] = {
      byWorkspace: {
        [W1]: {
          schemaVersion: 1,
          columns: legacyColumns(),
          tasks: [
            {
              kind: 'fix',
              id: TASK1,
              title: 'orphan task',
              description: '',
              columnId: 'ghost',
              dateStarted: 500,
              dateDone: null,
              dateArchive: null,
              severity: null,
              deadline: null,
            },
          ],
          columnOrder: { ghost: [TASK1] },
        },
      },
    }

    const { TodoStore } = await import('./TodoStore')
    const store = new TodoStore()
    const state = store.get(W1)

    const task = state.tasks.find((t) => t.id === TASK1)
    expect(task?.columnId).toBe('archive')
    expect(task?.createdAt).toBe(500)
    expect(state.columnOrder['archive']).toContain(TASK1)
  })

  it('keeps an existing createdAt untouched (idempotent on already-migrated state)', async () => {
    stateBySlot['todo'] = {
      byWorkspace: {
        [W1]: {
          schemaVersion: TODO_SCHEMA_VERSION,
          columns: legacyColumns(),
          tasks: [
            {
              kind: 'todo',
              id: TASK1,
              title: 'fresh task',
              description: '',
              columnId: 'created',
              createdAt: 42,
              dateStarted: 1000,
              dateDone: null,
              dateArchive: null,
              severity: null,
              deadline: null,
            },
          ],
          columnOrder: { created: [TASK1], archive: [] },
        },
      },
    }

    const { TodoStore } = await import('./TodoStore')
    const store = new TodoStore()
    const state = store.get(W1)

    const task = state.tasks.find((t) => t.id === TASK1)
    expect(task?.createdAt).toBe(42)
  })
})
