import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { ARCHIVE_COLUMN_ID, type Task } from '@shared/todo'
import { KanbanBoard } from './KanbanBoard'
import { SettingsTab } from './SettingsTab'
import { TaskDrawer } from './TaskDrawer'
import { TaskEditor } from './TaskEditor'
import { TodoHeader } from './Header'
import { DEFAULT_FILTER, type FilterState } from './FilterBar'
import { useTodoStore } from './store'

export interface TodoPaneProps {
  workspaceId: string
}

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'view'; taskId: string }
  | { mode: 'edit'; task: Task }

const SEVERITY_RANK: Record<NonNullable<Task['severity']>, number> = {
  high: 0,
  medium: 1,
  low: 2,
}

export function TodoPane({ workspaceId }: TodoPaneProps): ReactElement {
  const state = useTodoStore((s) => s.byWorkspace[workspaceId])
  const load = useTodoStore((s) => s.load)
  const createTask = useTodoStore((s) => s.createTask)
  const updateTask = useTodoStore((s) => s.updateTask)
  const deleteTask = useTodoStore((s) => s.deleteTask)
  const setColumns = useTodoStore((s) => s.setColumns)
  const toast = useTodoStore((s) => s.toast)
  const dismissToast = useTodoStore((s) => s.dismissToast)

  const [showArchive, setShowArchive] = useState(false)
  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER)
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' })
  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void load(workspaceId)
  }, [load, workspaceId])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => dismissToast(), toast.undo ? 5000 : 3500)
    return () => clearTimeout(t)
  }, [toast, dismissToast])

  const filterTask = useCallback(
    (task: Task): boolean => {
      if (!filter.kinds.has(task.kind)) return false
      if (task.severity !== null && !filter.severities.has(task.severity)) return false
      return true
    },
    [filter],
  )

  const sortedState = useMemo(() => {
    if (!state) return null
    if (filter.sort === 'manual') return state
    const cmp =
      filter.sort === 'deadline'
        ? (a: Task, b: Task) => (a.deadline ?? Number.POSITIVE_INFINITY) - (b.deadline ?? Number.POSITIVE_INFINITY)
        : filter.sort === 'severity'
          ? (a: Task, b: Task) =>
              (a.severity ? SEVERITY_RANK[a.severity] : 3) - (b.severity ? SEVERITY_RANK[b.severity] : 3)
          : (a: Task, b: Task) => a.dateStarted - b.dateStarted
    const taskMap = new Map(state.tasks.map((t) => [t.id, t]))
    const columnOrder: Record<string, string[]> = {}
    for (const col of state.columns) {
      const ids = state.columnOrder[col.id] ?? []
      const tasks = ids.map((id) => taskMap.get(id)).filter((t): t is Task => !!t)
      tasks.sort(cmp)
      columnOrder[col.id] = tasks.map((t) => t.id)
    }
    return { ...state, columnOrder }
  }, [state, filter.sort])

  const archivedCount = state?.columnOrder[ARCHIVE_COLUMN_ID]?.length ?? 0

  if (!state || !sortedState) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted">
        Loading TODO…
      </div>
    )
  }

  const defaultColumnId =
    state.columns.find((c) => c.id !== ARCHIVE_COLUMN_ID)?.id ?? state.columns[0]?.id ?? ARCHIVE_COLUMN_ID

  return (
    <div className="flex h-full flex-col bg-bg">
      <TodoHeader
        filter={filter}
        onFilterChange={setFilter}
        showArchive={showArchive}
        archivedCount={archivedCount}
        onToggleArchive={() => setShowArchive((v) => !v)}
        onNewTask={() => setEditor({ mode: 'create' })}
        onOpenSettings={() => setSettingsOpen((v) => !v)}
        settingsOpen={settingsOpen}
      />
      <div className="flex-1 overflow-hidden">
        <KanbanBoard
          workspaceId={workspaceId}
          state={sortedState}
          showArchive={showArchive}
          filterTask={filterTask}
          onOpenTask={(task) => setEditor({ mode: 'view', taskId: task.id })}
        />
      </div>

      {settingsOpen && (
        <SettingsTab
          state={state}
          onSave={(cols) => setColumns(workspaceId, cols)}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {editor.mode === 'view' &&
        (() => {
          const viewTask = state.tasks.find((t) => t.id === editor.taskId)
          if (!viewTask) return null
          return (
            <TaskDrawer
              task={viewTask}
              columns={state.columns}
              onEdit={() => setEditor({ mode: 'edit', task: viewTask })}
              onDelete={async (t) => {
                await deleteTask(workspaceId, t)
                setEditor({ mode: 'closed' })
              }}
              onClose={() => setEditor({ mode: 'closed' })}
            />
          )
        })()}

      {(editor.mode === 'create' || editor.mode === 'edit') && (
        <TaskEditor
          task={editor.mode === 'edit' ? editor.task : undefined}
          columns={state.columns}
          defaultColumnId={defaultColumnId}
          onSave={async (task) => {
            if (editor.mode === 'edit') await updateTask(workspaceId, task)
            else await createTask(workspaceId, task)
          }}
          onDelete={async (task) => {
            await deleteTask(workspaceId, task)
          }}
          onClose={() =>
            editor.mode === 'edit'
              ? setEditor({ mode: 'view', taskId: editor.task.id })
              : setEditor({ mode: 'closed' })
          }
        />
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-auto fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border border-border bg-bg-elevated px-3 py-2 text-xs shadow-lg"
        >
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              type="button"
              onClick={() => {
                toast.undo?.()
                dismissToast()
              }}
              className="rounded-sm border border-border bg-bg-sunken px-2 py-0.5 font-semibold uppercase tracking-wide text-accent hover:border-accent"
            >
              Undo
            </button>
          )}
          <button
            type="button"
            onClick={dismissToast}
            className="text-muted hover:text-fg"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
