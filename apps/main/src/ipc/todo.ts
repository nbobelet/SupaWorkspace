import { ipcMain } from 'electron'
import {
  IpcChannel,
  TodoCreateTaskRequest,
  TodoDeleteTaskRequest,
  TodoGetRequest,
  TodoReorderRequest,
  TodoSetColumnsRequest,
  TodoUpdateTaskRequest,
  type TodoGetResponse,
  type TodoStateResponse,
} from '@shared/ipc'
import { ARCHIVE_COLUMN_ID, type TodoState } from '@shared/todo'
import type { TodoStore } from '../todo/TodoStore'

export function registerTodoIpc(opts: { todoStore: TodoStore }): () => void {
  const { todoStore } = opts

  ipcMain.handle(IpcChannel.TodoGet, async (_, raw): Promise<TodoGetResponse> => {
    const req = TodoGetRequest.parse(raw)
    return { state: todoStore.get(req.workspaceId), fallbackUsed: false }
  })

  ipcMain.handle(IpcChannel.TodoCreateTask, async (_, raw): Promise<TodoStateResponse> => {
    const req = TodoCreateTaskRequest.parse(raw)
    const state = todoStore.mutate(req.workspaceId, (prev) => {
      if (prev.tasks.some((t) => t.id === req.task.id)) return prev
      const targetCol = prev.columns.find((c) => c.id === req.task.columnId)?.id ?? ARCHIVE_COLUMN_ID
      const task = targetCol === req.task.columnId ? req.task : { ...req.task, columnId: targetCol }
      return {
        ...prev,
        tasks: [...prev.tasks, task],
        columnOrder: {
          ...prev.columnOrder,
          [targetCol]: [...(prev.columnOrder[targetCol] ?? []), task.id],
        },
      }
    })
    return { state }
  })

  ipcMain.handle(IpcChannel.TodoUpdateTask, async (_, raw): Promise<TodoStateResponse> => {
    const req = TodoUpdateTaskRequest.parse(raw)
    const state = todoStore.mutate(req.workspaceId, (prev) => {
      const prevTask = prev.tasks.find((t) => t.id === req.task.id)
      if (!prevTask) return prev
      const targetCol = prev.columns.find((c) => c.id === req.task.columnId)?.id ?? prevTask.columnId
      const task = targetCol === req.task.columnId ? req.task : { ...req.task, columnId: targetCol }

      const tasks = prev.tasks.map((t) => (t.id === task.id ? task : t))
      if (prevTask.columnId === task.columnId) {
        return { ...prev, tasks }
      }
      const columnOrder = { ...prev.columnOrder }
      columnOrder[prevTask.columnId] = (columnOrder[prevTask.columnId] ?? []).filter((id) => id !== task.id)
      columnOrder[task.columnId] = [...(columnOrder[task.columnId] ?? []), task.id]
      return { ...prev, tasks, columnOrder }
    })
    return { state }
  })

  ipcMain.handle(IpcChannel.TodoDeleteTask, async (_, raw): Promise<TodoStateResponse> => {
    const req = TodoDeleteTaskRequest.parse(raw)
    const state = todoStore.mutate(req.workspaceId, (prev) => {
      const tasks = prev.tasks.filter((t) => t.id !== req.taskId)
      if (tasks.length === prev.tasks.length) return prev
      const columnOrder: Record<string, string[]> = {}
      for (const [colId, ids] of Object.entries(prev.columnOrder)) {
        columnOrder[colId] = ids.filter((id) => id !== req.taskId)
      }
      return { ...prev, tasks, columnOrder }
    })
    return { state }
  })

  ipcMain.handle(IpcChannel.TodoReorder, async (_, raw): Promise<TodoStateResponse> => {
    const req = TodoReorderRequest.parse(raw)
    const state = todoStore.mutate(req.workspaceId, (prev) => {
      const task = prev.tasks.find((t) => t.id === req.taskId)
      if (!task) return prev
      if (!prev.columns.some((c) => c.id === req.toColumnId)) return prev

      const fromColId = task.columnId
      const movingToNewColumn = fromColId !== req.toColumnId

      const columnOrder: Record<string, string[]> = { ...prev.columnOrder }
      columnOrder[fromColId] = (columnOrder[fromColId] ?? []).filter((id) => id !== req.taskId)
      const target = [...(columnOrder[req.toColumnId] ?? [])]
      const insertAt = Math.max(0, Math.min(req.toIndex, target.length))
      target.splice(insertAt, 0, req.taskId)
      columnOrder[req.toColumnId] = target

      const tasks = movingToNewColumn
        ? prev.tasks.map((t) => (t.id === req.taskId ? { ...t, columnId: req.toColumnId } : t))
        : prev.tasks

      return { ...prev, tasks, columnOrder }
    })
    return { state }
  })

  ipcMain.handle(IpcChannel.TodoSetColumns, async (_, raw): Promise<TodoStateResponse> => {
    const req = TodoSetColumnsRequest.parse(raw)
    const state = todoStore.mutate(req.workspaceId, (prev) =>
      applySetColumns(prev, req.columns),
    )
    return { state }
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.TodoGet)
    ipcMain.removeHandler(IpcChannel.TodoCreateTask)
    ipcMain.removeHandler(IpcChannel.TodoUpdateTask)
    ipcMain.removeHandler(IpcChannel.TodoDeleteTask)
    ipcMain.removeHandler(IpcChannel.TodoReorder)
    ipcMain.removeHandler(IpcChannel.TodoSetColumns)
  }
}

/**
 * Auto-move-to-archive policy on column delete: any task whose previous
 * columnId is missing from the incoming `nextColumns` list is reassigned
 * to the archive column (which the caller is forbidden from removing —
 * `applySetColumns` re-injects archive if missing as a safety net rather
 * than throwing).
 */
function applySetColumns(prev: TodoState, nextColumns: TodoState['columns']): TodoState {
  const archive = nextColumns.find((c) => c.id === ARCHIVE_COLUMN_ID) ?? {
    id: ARCHIVE_COLUMN_ID,
    name: 'Archive',
    color: '#64748b',
    order: nextColumns.length,
    builtin: true,
  }
  const columns =
    nextColumns.some((c) => c.id === ARCHIVE_COLUMN_ID)
      ? nextColumns
      : [...nextColumns, archive]
  const validIds = new Set(columns.map((c) => c.id))

  const tasks = prev.tasks.map((t) =>
    validIds.has(t.columnId) ? t : { ...t, columnId: ARCHIVE_COLUMN_ID },
  )

  const columnOrder: Record<string, string[]> = {}
  for (const c of columns) columnOrder[c.id] = []

  const seen = new Set<string>()
  for (const c of columns) {
    const prior = prev.columnOrder[c.id] ?? []
    for (const id of prior) {
      const task = tasks.find((t) => t.id === id)
      if (!task || seen.has(id) || task.columnId !== c.id) continue
      columnOrder[c.id]!.push(id)
      seen.add(id)
    }
  }
  for (const t of tasks) {
    if (seen.has(t.id)) continue
    columnOrder[t.columnId]!.push(t.id)
    seen.add(t.id)
  }

  return { ...prev, columns, tasks, columnOrder }
}
