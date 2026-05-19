import { CalendarClock, Pencil, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { Column, Task } from '@shared/todo'
import { KindPill } from './KindPill'

export interface TaskDrawerProps {
  task: Task
  columns: Column[]
  onEdit: () => void
  onDelete?: (task: Task) => void | Promise<void>
  onClose: () => void
}

const SEVERITY_LABEL: Record<NonNullable<Task['severity']>, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
}

const SEVERITY_COLOR_VAR: Record<NonNullable<Task['severity']>, string> = {
  low: 'var(--color-severity-low)',
  medium: 'var(--color-severity-medium)',
  high: 'var(--color-severity-high)',
}

function fmt(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function TaskDrawer({
  task,
  columns,
  onEdit,
  onDelete,
  onClose,
}: TaskDrawerProps): ReactElement {
  const closeRef = useRef<HTMLButtonElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true))
    return () => cancelAnimationFrame(id)
  }, [])

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const column = columns.find((c) => c.id === task.columnId)

  const timeline: { label: string; ts: number }[] = [
    { label: 'Created', ts: task.createdAt },
    { label: 'Started', ts: task.dateStarted },
  ]
  if (task.dateDone !== null) timeline.push({ label: 'Done', ts: task.dateDone })
  if (task.dateArchive !== null) timeline.push({ label: 'Archived', ts: task.dateArchive })

  const overdue = task.deadline !== null && task.deadline < Date.now() && task.dateDone === null

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Task detail: ${task.title}`}
      className={[
        'fixed inset-y-0 right-0 z-40 flex w-96 max-w-full flex-col border-l border-border bg-bg-elevated shadow-xl',
        'transition-transform duration-200 ease-out motion-reduce:transition-none',
        shown ? 'translate-x-0' : 'translate-x-full motion-reduce:translate-x-0',
      ].join(' ')}
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <KindPill kind={task.kind} size="md" />
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close task detail"
          className="text-muted hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 text-sm">
        <h2 className="text-base font-semibold leading-snug">{task.title}</h2>

        <dl className="mt-4 flex flex-col gap-2">
          {column && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted">Column</dt>
              <dd className="inline-flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ backgroundColor: column.color }}
                />
                {column.name}
              </dd>
            </div>
          )}

          {task.severity && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted">Severity</dt>
              <dd
                className="inline-flex items-center gap-1.5"
                style={{ color: SEVERITY_COLOR_VAR[task.severity] }}
                aria-label={`Severity: ${SEVERITY_LABEL[task.severity]}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'currentColor' }}
                />
                {SEVERITY_LABEL[task.severity]}
              </dd>
            </div>
          )}

          {task.deadline !== null && (
            <div className="flex items-center justify-between gap-3">
              <dt className="text-[11px] uppercase tracking-wider text-muted">Deadline</dt>
              <dd
                className={`inline-flex items-center gap-1.5 ${overdue ? 'font-semibold text-error' : ''}`}
                aria-label={`Deadline: ${fmtDate(task.deadline)}${overdue ? ' (overdue)' : ''}`}
              >
                <CalendarClock size={12} aria-hidden="true" />
                {fmtDate(task.deadline)}
              </dd>
            </div>
          )}
        </dl>

        <section className="mt-5">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">Timeline</h3>
          <ul className="mt-2 flex flex-col gap-1.5">
            {timeline.map((row) => (
              <li key={row.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">{row.label}</span>
                <span className="tabular-nums">{fmt(row.ts)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">Description</h3>
          {task.description.trim() ? (
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">
              {task.description}
            </p>
          ) : (
            <p className="mt-2 text-xs italic text-muted">No description</p>
          )}
        </section>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        {onDelete ? (
          <button
            type="button"
            onClick={() => void onDelete(task)}
            className="inline-flex items-center gap-1 rounded-sm border border-error/40 bg-error/10 px-2 py-1 text-xs text-error hover:border-error"
          >
            <Trash2 size={12} aria-hidden="true" />
            Delete
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/10 px-3 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
        >
          <Pencil size={12} aria-hidden="true" />
          Edit
        </button>
      </footer>
    </div>
  )
}
