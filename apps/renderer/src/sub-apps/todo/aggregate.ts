import type { Task, TodoState } from '@shared/todo'

export interface WorkspaceTodo {
  workspaceId: string
  state: TodoState
}

export interface AggregatedTodo {
  /** Merged board state, rendered with the canonical (Home) column set. */
  state: TodoState
  /** taskId -> the workspace it actually belongs to, for routing mutations. */
  originOf: Map<string, string>
}

/**
 * Merge per-workspace TODO states into one board WITHOUT parallel storage:
 * every task keeps living in its own workspace's store; this only produces an
 * in-memory aggregated view. Tasks are bucketed by their `columnId` into the
 * canonical column set (Home's columns); unknown columns are tolerated by
 * appending them. `originOf` lets the caller route update/delete/reorder back
 * to the owning workspace.
 */
export function mergeTodoStates(entries: WorkspaceTodo[], canonical: TodoState): AggregatedTodo {
  const originOf = new Map<string, string>()
  const tasks: Task[] = []
  const columnOrder: Record<string, string[]> = {}
  for (const col of canonical.columns) columnOrder[col.id] = []

  for (const { workspaceId, state } of entries) {
    const byId = new Map(state.tasks.map((t) => [t.id, t]))
    for (const colId of Object.keys(state.columnOrder)) {
      const bucket = columnOrder[colId] ?? (columnOrder[colId] = [])
      for (const id of state.columnOrder[colId] ?? []) {
        const task = byId.get(id)
        if (!task) continue
        tasks.push(task)
        bucket.push(id)
        originOf.set(id, workspaceId)
      }
    }
  }

  return { state: { ...canonical, tasks, columnOrder }, originOf }
}
