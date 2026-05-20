import { describe, expect, it } from 'vitest'
import { ARCHIVE_COLUMN_ID, TODO_SCHEMA_VERSION, type TodoState } from '@shared/todo'
import { normalizeColumns } from './normalizeColumns'

const TASK_A = '00000000-0000-0000-0000-00000000aaaa'
const TASK_B = '00000000-0000-0000-0000-00000000bbbb'

function makeTask(id: string, columnId: string): TodoState['tasks'][number] {
  return {
    kind: 'todo',
    id,
    title: 'task',
    description: '',
    columnId,
    createdAt: 1000,
    dateStarted: 1000,
    dateDone: null,
    dateArchive: null,
    severity: null,
    deadline: null,
  }
}

function baseState(overrides?: Partial<TodoState>): TodoState {
  return {
    schemaVersion: TODO_SCHEMA_VERSION,
    columns: [
      { id: 'created', name: 'Created', color: '#94a3b8', order: 0, builtin: true },
      { id: 'archive', name: 'Archive', color: '#64748b', order: 1, builtin: true },
    ],
    tasks: [],
    columnOrder: { created: [], archive: [] },
    ...overrides,
  }
}

describe('normalizeColumns', () => {
  it('does not mutate the input state', () => {
    const input = baseState({
      tasks: [makeTask(TASK_A, 'created')],
      columnOrder: { created: [TASK_A], archive: [] },
    })
    const snapshot = JSON.parse(JSON.stringify(input)) as TodoState
    normalizeColumns(input)
    expect(input).toEqual(snapshot)
  })

  it('adds archive column when missing', () => {
    const input: TodoState = {
      schemaVersion: TODO_SCHEMA_VERSION,
      columns: [{ id: 'created', name: 'Created', color: '#94a3b8', order: 0, builtin: true }],
      tasks: [],
      columnOrder: { created: [] },
    }
    const result = normalizeColumns(input)
    expect(result.columns.some((c) => c.id === ARCHIVE_COLUMN_ID)).toBe(true)
    expect(result.columnOrder[ARCHIVE_COLUMN_ID]).toEqual([])
  })

  it('deduplicates a task id that appears twice in columnOrder', () => {
    const input = baseState({
      tasks: [makeTask(TASK_A, 'created')],
      // TASK_A listed twice in the same column
      columnOrder: { created: [TASK_A, TASK_A], archive: [] },
    })
    const result = normalizeColumns(input)
    const allIds = Object.values(result.columnOrder).flat()
    expect(allIds.filter((id) => id === TASK_A)).toHaveLength(1)
  })

  it('appends a task missing from columnOrder to the correct column', () => {
    const input = baseState({
      tasks: [makeTask(TASK_A, 'created')],
      columnOrder: { created: [], archive: [] }, // TASK_A not listed
    })
    const result = normalizeColumns(input)
    expect(result.columnOrder['created']).toContain(TASK_A)
    const allIds = Object.values(result.columnOrder).flat()
    expect(allIds.filter((id) => id === TASK_A)).toHaveLength(1)
  })

  it('deduplicates a task id that appears in two different columns', () => {
    const input = baseState({
      tasks: [makeTask(TASK_A, 'created')],
      // TASK_A listed in both columns — should only survive in the one matching task.columnId
      columnOrder: { created: [TASK_A], archive: [TASK_A] },
    })
    const result = normalizeColumns(input)
    const allIds = Object.values(result.columnOrder).flat()
    expect(allIds.filter((id) => id === TASK_A)).toHaveLength(1)
    expect(result.columnOrder['created']).toContain(TASK_A)
    expect(result.columnOrder['archive']).not.toContain(TASK_A)
  })

  it('is stable on an empty/fresh state', () => {
    const input = baseState()
    const result = normalizeColumns(input)
    expect(result.tasks).toEqual([])
    expect(result.columnOrder).toEqual({ created: [], archive: [] })
    expect(result.columns).toHaveLength(2)
  })

  it('each column gets a columnOrder entry even for columns not previously in columnOrder', () => {
    const input: TodoState = {
      schemaVersion: TODO_SCHEMA_VERSION,
      columns: [
        { id: 'created', name: 'Created', color: '#94a3b8', order: 0, builtin: true },
        { id: 'running', name: 'Running', color: '#3b82f6', order: 1, builtin: true },
        { id: 'archive', name: 'Archive', color: '#64748b', order: 2, builtin: true },
      ],
      tasks: [makeTask(TASK_A, 'created'), makeTask(TASK_B, 'running')],
      columnOrder: { created: [TASK_A] }, // 'running' and 'archive' missing
    }
    const result = normalizeColumns(input)
    expect(result.columnOrder['running']).toContain(TASK_B)
    expect(result.columnOrder['archive']).toEqual([])
    const allIds = Object.values(result.columnOrder).flat()
    expect(allIds).toHaveLength(2)
  })
})
