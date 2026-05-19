import { create } from 'zustand'
import type { Column, Task, TodoState } from '@shared/todo'
import type { TodoToastState } from './types'

interface TodoStoreState {
  byWorkspace: Record<string, TodoState>
  loadedFor: Record<string, true>
  loadingFor: Record<string, true>
  toast: TodoToastState | null
  load: (workspaceId: string) => Promise<void>
  createTask: (workspaceId: string, task: Task) => Promise<void>
  updateTask: (workspaceId: string, task: Task) => Promise<void>
  deleteTask: (workspaceId: string, task: Task) => Promise<void>
  reorder: (
    workspaceId: string,
    taskId: string,
    toColumnId: string,
    toIndex: number,
  ) => Promise<void>
  setColumns: (workspaceId: string, columns: Column[]) => Promise<void>
  pushToast: (toast: TodoToastState) => void
  dismissToast: () => void
}

let toastSeq = 0

function nextToastSeq(): number {
  toastSeq += 1
  return toastSeq
}

export const useTodoStore = create<TodoStoreState>((set, get) => ({
  byWorkspace: {},
  loadedFor: {},
  loadingFor: {},
  toast: null,

  load: async (workspaceId): Promise<void> => {
    const state = get()
    if (state.loadedFor[workspaceId] || state.loadingFor[workspaceId]) return
    set((prev) => ({ loadingFor: { ...prev.loadingFor, [workspaceId]: true } }))
    try {
      const res = await window.ws.todo.get(workspaceId)
      set((prev) => ({
        byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.state },
        loadedFor: { ...prev.loadedFor, [workspaceId]: true },
      }))
      if (res.fallbackUsed) {
        get().pushToast({
          message: 'TODO stored in user data (workspace readonly)',
          seq: nextToastSeq(),
          variant: 'info',
        })
      }
    } finally {
      set((prev) => {
        const next = { ...prev.loadingFor }
        delete next[workspaceId]
        return { loadingFor: next }
      })
    }
  },

  createTask: async (workspaceId, task): Promise<void> => {
    const res = await window.ws.todo.createTask({ workspaceId, task })
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.state },
    }))
  },

  updateTask: async (workspaceId, task): Promise<void> => {
    const res = await window.ws.todo.updateTask({ workspaceId, task })
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.state },
    }))
  },

  deleteTask: async (workspaceId, task): Promise<void> => {
    const prevState = get().byWorkspace[workspaceId]
    const res = await window.ws.todo.deleteTask({ workspaceId, taskId: task.id })
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.state },
    }))
    if (prevState) {
      const restore = task
      get().pushToast({
        message: `Deleted "${task.title}"`,
        seq: nextToastSeq(),
        variant: 'info',
        undo: () => {
          void window.ws.todo.createTask({ workspaceId, task: restore }).then((r) => {
            useTodoStore.setState((prev) => ({
              byWorkspace: { ...prev.byWorkspace, [workspaceId]: r.state },
            }))
          })
        },
      })
    }
  },

  reorder: async (workspaceId, taskId, toColumnId, toIndex): Promise<void> => {
    const prevState = get().byWorkspace[workspaceId]
    if (!prevState) return

    const optimistic = applyOptimisticReorder(prevState, taskId, toColumnId, toIndex)
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: optimistic },
    }))

    try {
      const res = await window.ws.todo.reorder({ workspaceId, taskId, toColumnId, toIndex })
      set((prev) => ({
        byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.state },
      }))
    } catch (err) {
      console.error('[todo] reorder failed, reverting', err)
      set((prev) => ({
        byWorkspace: { ...prev.byWorkspace, [workspaceId]: prevState },
      }))
    }
  },

  setColumns: async (workspaceId, columns): Promise<void> => {
    const res = await window.ws.todo.setColumns({ workspaceId, columns })
    set((prev) => ({
      byWorkspace: { ...prev.byWorkspace, [workspaceId]: res.state },
    }))
  },

  pushToast: (toast): void => set({ toast }),
  dismissToast: (): void => set({ toast: null }),
}))

function applyOptimisticReorder(
  state: TodoState,
  taskId: string,
  toColumnId: string,
  toIndex: number,
): TodoState {
  const task = state.tasks.find((t) => t.id === taskId)
  if (!task) return state
  if (!state.columns.some((c) => c.id === toColumnId)) return state

  const fromColId = task.columnId
  const columnOrder: Record<string, string[]> = { ...state.columnOrder }
  columnOrder[fromColId] = (columnOrder[fromColId] ?? []).filter((id) => id !== taskId)
  const target = [...(columnOrder[toColumnId] ?? [])]
  const insertAt = Math.max(0, Math.min(toIndex, target.length))
  target.splice(insertAt, 0, taskId)
  columnOrder[toColumnId] = target

  const tasks =
    fromColId === toColumnId
      ? state.tasks
      : state.tasks.map((t) => (t.id === taskId ? { ...t, columnId: toColumnId } : t))

  return { ...state, tasks, columnOrder }
}
