import { describe, expect, it, vi, beforeEach } from 'vitest'
import { z } from 'zod'
import type { LegacyMigrationResult } from './SubAppStore'

interface MockShape {
  byWorkspace: Record<string, unknown>
}

const data: { current: MockShape } = { current: { byWorkspace: {} } }

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      get<T>(key: keyof MockShape, fallback?: T): T {
        return (data.current[key] as unknown as T) ?? (fallback as T)
      }
      set<K extends keyof MockShape>(key: K, value: MockShape[K]): void {
        data.current[key] = value
      }
    },
  }
})

beforeEach(() => {
  data.current = { byWorkspace: {} }
})

const StringSchema = z.string()

const W1 = '550e8400-e29b-41d4-a716-446655440001'
const W2 = '550e8400-e29b-41d4-a716-446655440002'

describe('SubAppStore', () => {
  it('returns the default value when no entry exists for a workspace', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const store = new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
    })
    expect(store.get(W1)).toBe('')
  })

  it('persists then retrieves a workspace-scoped payload', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const store = new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
    })
    store.set(W1, 'hello')
    expect(store.get(W1)).toBe('hello')
    expect(store.get(W2)).toBe('')
  })

  it('remove() drops only the targeted workspace entry', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const store = new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
    })
    store.set(W1, 'a')
    store.set(W2, 'b')
    store.remove(W1)
    expect(store.get(W1)).toBe('')
    expect(store.get(W2)).toBe('b')
  })

  it('lock() prevents subsequent writes', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const store = new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
    })
    store.set(W1, 'first')
    store.lock()
    store.set(W1, 'second')
    expect(store.get(W1)).toBe('first')
  })

  it('runLegacyMigration runs only when target is empty (idempotence guard)', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const migration = vi.fn(
      (): LegacyMigrationResult<string> => ({
        byWorkspace: { [W1]: 'from-legacy' },
        migratedCount: 1,
        sourceLabel: 'legacy.json',
      }),
    )

    new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
      runLegacyMigration: migration,
    })
    expect(migration).toHaveBeenCalledTimes(1)
    expect(data.current.byWorkspace[W1]).toBe('from-legacy')

    // Second construction: target already has data, migration must NOT run.
    new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
      runLegacyMigration: migration,
    })
    expect(migration).toHaveBeenCalledTimes(1)
  })

  it('runLegacyMigration returning null is a no-op', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const migration = vi.fn((): LegacyMigrationResult<string> | null => null)

    new SubAppStore<string>({
      id: 'notes',
      defaultValue: () => '',
      schema: StringSchema,
      runLegacyMigration: migration,
    })
    expect(migration).toHaveBeenCalledTimes(1)
    expect(data.current.byWorkspace).toEqual({})
  })

  it('set() validates input via the provided schema', async () => {
    const { SubAppStore } = await import('./SubAppStore')
    const NumberSchema = z.number().int().nonnegative()
    const store = new SubAppStore<number>({
      id: 'notes',
      defaultValue: () => 0,
      schema: NumberSchema,
    })
    expect(() => store.set(W1, -1)).toThrow()
    expect(store.get(W1)).toBe(0)
  })
})
