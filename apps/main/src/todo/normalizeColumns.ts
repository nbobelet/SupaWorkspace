import { ARCHIVE_COLUMN_ID, type Column, type TodoState } from '@shared/todo'

/**
 * Pure column-normalization pass. Invariants enforced:
 *  1. The archive column exists in `columns`.
 *  2. Every column has an entry in `columnOrder`.
 *  3. Every task appears exactly once across all `columnOrder` lists,
 *     placed in the list that matches its `task.columnId`.
 *
 * Does not mutate the input. Does not backfill `createdAt` — that is
 * repair-only logic that lives in `TodoStore.repair()`.
 */
export function normalizeColumns(state: TodoState): TodoState {
  const archiveExists = state.columns.some((c) => c.id === ARCHIVE_COLUMN_ID)

  const archiveColumn: Column = {
    id: ARCHIVE_COLUMN_ID,
    name: 'Archive',
    color: '#64748b',
    order: state.columns.length,
    builtin: true,
  }

  const columns: Column[] = archiveExists ? state.columns : [...state.columns, archiveColumn]

  const columnOrder: Record<string, string[]> = {}
  for (const c of columns) columnOrder[c.id] = []

  const seen = new Set<string>()
  for (const c of columns) {
    const prior = state.columnOrder[c.id] ?? []
    for (const id of prior) {
      const task = state.tasks.find((t) => t.id === id)
      if (!task || seen.has(id) || task.columnId !== c.id) continue
      columnOrder[c.id]!.push(id)
      seen.add(id)
    }
  }
  for (const t of state.tasks) {
    if (seen.has(t.id)) continue
    columnOrder[t.columnId]!.push(t.id)
    seen.add(t.id)
  }

  return { ...state, columns, columnOrder }
}
