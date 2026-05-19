import { useEffect, useState, type ReactElement } from 'react'
import type { Column, Task, TaskKind, TaskSeverity } from '@shared/todo'
import { ARCHIVE_COLUMN_ID } from '@shared/todo'
import { KindPill } from './KindPill'

export interface TaskEditorProps {
  /** When `task` is provided we are editing; when undefined we are creating. */
  task?: Task
  columns: Column[]
  defaultColumnId: string
  onSave: (task: Task) => void | Promise<void>
  onDelete?: (task: Task) => void | Promise<void>
  onClose: () => void
}

interface FormState {
  kind: TaskKind
  title: string
  description: string
  columnId: string
  severity: TaskSeverity | ''
  deadline: string
}

function toDateInputValue(ts: number | null): string {
  if (ts === null) return ''
  return new Date(ts).toISOString().slice(0, 10)
}

function fromDateInputValue(v: string): number | null {
  if (!v) return null
  const t = Date.parse(`${v}T00:00:00`)
  return Number.isFinite(t) ? t : null
}

function initialState(task: Task | undefined, defaultColumnId: string): FormState {
  if (!task) {
    return {
      kind: 'todo',
      title: '',
      description: '',
      columnId: defaultColumnId,
      severity: '',
      deadline: '',
    }
  }
  return {
    kind: task.kind,
    title: task.title,
    description: task.description,
    columnId: task.columnId,
    severity: task.severity ?? '',
    deadline: toDateInputValue(task.deadline),
  }
}

export function TaskEditor({
  task,
  columns,
  defaultColumnId,
  onSave,
  onDelete,
  onClose,
}: TaskEditorProps): ReactElement {
  const [form, setForm] = useState<FormState>(() => initialState(task, defaultColumnId))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setForm(initialState(task, defaultColumnId))
  }, [task, defaultColumnId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isEditing = task !== undefined
  const sortedColumns = [...columns].sort((a, b) => a.order - b.order)

  const submit = async (): Promise<void> => {
    const trimmed = form.title.trim()
    if (!trimmed) {
      setError('Title is required')
      return
    }
    const now = Date.now()
    const base: Pick<
      Task,
      'id' | 'title' | 'description' | 'columnId' | 'createdAt' | 'dateStarted' | 'dateDone' | 'dateArchive' | 'severity' | 'deadline'
    > = {
      id: task?.id ?? crypto.randomUUID(),
      title: trimmed,
      description: form.description,
      columnId: form.columnId,
      createdAt: task?.createdAt ?? now,
      dateStarted: task?.dateStarted ?? now,
      dateDone: task?.dateDone ?? null,
      dateArchive:
        form.columnId === ARCHIVE_COLUMN_ID && task?.dateArchive === undefined ? now : (task?.dateArchive ?? null),
      severity: form.severity || null,
      deadline: fromDateInputValue(form.deadline),
    }
    const next: Task = form.kind === 'todo' ? { kind: 'todo', ...base } : { kind: 'fix', ...base }
    try {
      await onSave(next)
      onClose()
    } catch (err) {
      console.error('[todo] save failed', err)
      setError('Save failed — see console')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? 'Edit task' : 'New task'}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-md border border-border bg-bg-elevated p-4 text-sm">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
            {isEditing ? 'Edit task' : 'New task'}
          </h2>
          <KindPill kind={form.kind} size="md" />
        </header>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider text-muted" htmlFor="todo-kind">
            Kind
          </label>
          <div className="flex items-center gap-2" id="todo-kind" role="radiogroup" aria-label="Kind">
            {(['todo', 'fix'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                onClick={() => setForm((f) => ({ ...f, kind: k }))}
                className={[
                  'rounded-sm border px-2 py-1',
                  form.kind === k ? 'border-border-strong bg-bg-sunken' : 'border-border opacity-60',
                ].join(' ')}
              >
                <KindPill kind={k} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider text-muted" htmlFor="todo-title">
            Title <span className="text-error">*</span>
          </label>
          <input
            id="todo-title"
            autoFocus
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="rounded-sm border border-border bg-bg-sunken px-2 py-1 outline-none focus:border-accent"
            maxLength={200}
            aria-required="true"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider text-muted" htmlFor="todo-desc">
            Description
          </label>
          <textarea
            id="todo-desc"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            rows={4}
            className="rounded-sm border border-border bg-bg-sunken px-2 py-1 outline-none focus:border-accent"
            maxLength={10_000}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-muted" htmlFor="todo-column">
              Column
            </label>
            <select
              id="todo-column"
              value={form.columnId}
              onChange={(e) => setForm((f) => ({ ...f, columnId: e.target.value }))}
              className="rounded-sm border border-border bg-bg-sunken px-2 py-1"
            >
              {sortedColumns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] uppercase tracking-wider text-muted" htmlFor="todo-sev">
              Severity
            </label>
            <select
              id="todo-sev"
              value={form.severity}
              onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value as TaskSeverity | '' }))}
              className="rounded-sm border border-border bg-bg-sunken px-2 py-1"
            >
              <option value="">— none —</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[11px] uppercase tracking-wider text-muted" htmlFor="todo-deadline">
            Deadline
          </label>
          <input
            id="todo-deadline"
            type="date"
            value={form.deadline}
            onChange={(e) => setForm((f) => ({ ...f, deadline: e.target.value }))}
            className="rounded-sm border border-border bg-bg-sunken px-2 py-1"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-sm bg-error/10 px-2 py-1 text-xs text-error">
            {error}
          </p>
        )}

        <footer className="flex items-center justify-between gap-2 pt-2">
          <div>
            {isEditing && onDelete && task && (
              <button
                type="button"
                onClick={() => {
                  void onDelete(task)
                  onClose()
                }}
                className="rounded-sm border border-error/40 bg-error/10 px-2 py-1 text-xs text-error hover:border-error"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-border bg-bg-sunken px-3 py-1 text-xs hover:border-border-strong"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              className="rounded-sm border border-accent bg-accent/10 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
            >
              {isEditing ? 'Save' : 'Create'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
