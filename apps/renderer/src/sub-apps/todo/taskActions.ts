import type { Task, TaskSeverity } from '@shared/todo'
import type { ActionScope } from './selection'
import { useTodoStore } from './store'

export type CardAction = 'sev-low' | 'sev-medium' | 'sev-high' | 'edit' | 'delete'

export interface ActionContext {
  /** The card the menu was opened on. */
  clicked: Task
  /** Tasks the action applies to, already resolved via scope + selection. */
  targets: readonly Task[]
  /** Open a single task in the editor/drawer. */
  open: (task: Task) => void
}

export interface TaskActionDef {
  scope: ActionScope
  run: (ctx: ActionContext) => void
}

/**
 * Locate the workspace owning a task. The aggregated Home view shows tasks from
 * many workspaces, so a mutation must route back to the owner rather than the
 * board's own id (mirrors the single-card path that TaskCard used before).
 */
export function findTaskWorkspaceId(taskId: string): string | null {
  const { byWorkspace } = useTodoStore.getState()
  for (const [workspaceId, state] of Object.entries(byWorkspace)) {
    if (state.tasks.some((t) => t.id === taskId)) return workspaceId
  }
  return null
}

function setSeverity(severity: TaskSeverity): TaskActionDef {
  return {
    scope: 'selection',
    run: ({ targets }) => {
      const store = useTodoStore.getState()
      for (const task of targets) {
        if (task.severity === severity) continue // mirror the single-card no-op guard
        const workspaceId = findTaskWorkspaceId(task.id)
        if (workspaceId) void store.updateTask(workspaceId, { ...task, severity })
      }
    },
  }
}

/**
 * Action registry: scope + behaviour per context-menu action. A future bulk
 * action only needs one entry with `scope: 'selection'` — `resolveActionTargets`
 * fans it out and this map dispatches it, with no new conditional branches.
 */
export const TASK_ACTIONS: Record<CardAction, TaskActionDef> = {
  'sev-low': setSeverity('low'),
  'sev-medium': setSeverity('medium'),
  'sev-high': setSeverity('high'),
  delete: {
    scope: 'selection',
    // Bulk delete reuses the per-task store action. The store keeps only the
    // latest toast, so a multi-delete surfaces a single (last) undo affordance;
    // batching N undos into one is deliberately out of scope here.
    run: ({ targets }) => {
      const store = useTodoStore.getState()
      for (const task of targets) {
        const workspaceId = findTaskWorkspaceId(task.id)
        if (workspaceId) void store.deleteTask(workspaceId, task)
      }
    },
  },
  edit: {
    scope: 'single',
    run: ({ clicked, open }) => open(clicked),
  },
}
