import {
  ARCHIVE_COLUMN_ID,
  type Column,
  defaultTodoState,
  type Task,
  TODO_SCHEMA_VERSION,
  TodoState,
} from '@shared/todo'
import { SubAppStore } from '../sub-apps/SubAppStore'

/**
 * Per-workspace kanban store. Inherits the byWorkspace envelope from
 * SubAppStore (electron-store under userData, schema-validated on write).
 *
 * `get` overrides the base to run a tolerant repair pass so a partial
 * write (e.g. a task whose `columnId` was removed by an external edit)
 * never strands data: orphan tasks fall back to the archive column, and
 * `columnOrder` is normalised so every existing column has an entry and
 * every task appears in exactly one ordered list.
 */
export class TodoStore extends SubAppStore<TodoState> {
  constructor() {
    super({
      id: 'todo',
      defaultValue: defaultTodoState,
      schema: TodoState,
    })
  }

  override get(workspaceId: string): TodoState {
    return repair(super.get(workspaceId))
  }

  /**
   * Atomic read-modify-write. Repairs the loaded state before passing to
   * the mutator so callers always see a consistent view; the mutator's
   * return value is validated by `set` (which calls schema.parse), so any
   * structurally invalid mutation throws before landing on disk.
   */
  mutate(workspaceId: string, fn: (state: TodoState) => TodoState): TodoState {
    const next = fn(this.get(workspaceId))
    this.set(workspaceId, next)
    return next
  }
}

function repair(state: TodoState): TodoState {
  const columnIds = new Set(state.columns.map((c) => c.id))
  const archiveExists = columnIds.has(ARCHIVE_COLUMN_ID)

  const columns: Column[] = archiveExists
    ? state.columns
    : [
        ...state.columns,
        {
          id: ARCHIVE_COLUMN_ID,
          name: 'Archive',
          color: '#64748b',
          order: state.columns.length,
          builtin: true,
        },
      ]
  if (!archiveExists) columnIds.add(ARCHIVE_COLUMN_ID)

  const tasks: Task[] = state.tasks.map((t) => {
    const columnId = columnIds.has(t.columnId) ? t.columnId : ARCHIVE_COLUMN_ID
    const createdAt = (t as { createdAt?: number }).createdAt ?? t.dateStarted
    return { ...t, columnId, createdAt }
  })

  const columnOrder: Record<string, string[]> = {}
  for (const c of columns) columnOrder[c.id] = []

  const seen = new Set<string>()
  for (const c of columns) {
    const fromStored = state.columnOrder[c.id] ?? []
    for (const taskId of fromStored) {
      const task = tasks.find((t) => t.id === taskId)
      if (!task || seen.has(taskId)) continue
      if (task.columnId !== c.id) continue
      columnOrder[c.id]!.push(taskId)
      seen.add(taskId)
    }
  }
  for (const t of tasks) {
    if (seen.has(t.id)) continue
    columnOrder[t.columnId]!.push(t.id)
    seen.add(t.id)
  }

  return {
    schemaVersion: TODO_SCHEMA_VERSION,
    columns,
    tasks,
    columnOrder,
  }
}
