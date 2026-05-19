import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, ChevronRight } from 'lucide-react'
import type { CSSProperties, ReactElement } from 'react'
import type { Task } from '@shared/todo'
import { KindPill } from './KindPill'

export interface TaskCardProps {
  task: Task
  onOpen: (task: Task) => void
}

const SEVERITY_LABEL: Record<NonNullable<Task['severity']>, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
}

const SEVERITY_COLOR_VAR: Record<NonNullable<Task['severity']>, string> = {
  low: 'var(--color-severity-low)',
  medium: 'var(--color-severity-medium)',
  high: 'var(--color-severity-high)',
}

export function TaskCard({ task, onOpen }: TaskCardProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', columnId: task.columnId },
  })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const deadline = task.deadline ? formatDeadline(task.deadline) : null
  const overdue =
    task.deadline !== null && task.deadline < Date.now() && task.dateDone === null

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={[
        'group/card relative rounded-md border border-border bg-bg-elevated text-fg',
        'hover:border-border-strong focus-within:border-accent',
        isDragging ? 'z-10 shadow-lg' : '',
      ].join(' ')}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex w-full flex-col gap-2 px-3 py-2 text-left focus-visible:outline-none"
        aria-label={`Open task ${task.title}`}
      >
        <div className="flex items-start justify-between gap-2">
          <KindPill kind={task.kind} />
          <ChevronRight
            size={12}
            className="mt-0.5 text-muted opacity-0 transition-opacity group-hover/card:opacity-100"
            aria-hidden="true"
          />
        </div>
        <div className="line-clamp-2 text-sm font-medium leading-snug">{task.title}</div>
        {(task.severity || deadline) && (
          <div className="flex items-center gap-2 text-[11px] text-fg-subtle">
            {task.severity && (
              <span
                className="inline-flex items-center gap-1"
                style={{ color: SEVERITY_COLOR_VAR[task.severity] }}
                aria-label={`Severity: ${SEVERITY_LABEL[task.severity]}`}
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: 'currentColor' }}
                />
                {SEVERITY_LABEL[task.severity]}
              </span>
            )}
            {deadline && (
              <span
                className={`inline-flex items-center gap-1 ${overdue ? 'text-error font-semibold' : ''}`}
                aria-label={`Deadline: ${deadline.absolute}${overdue ? ' (overdue)' : ''}`}
              >
                <CalendarClock size={10} aria-hidden="true" />
                {deadline.relative}
              </span>
            )}
          </div>
        )}
      </button>
    </li>
  )
}

function formatDeadline(ts: number): { relative: string; absolute: string } {
  const now = Date.now()
  const diffMs = ts - now
  const oneDay = 86_400_000
  const days = Math.round(diffMs / oneDay)
  const absolute = new Date(ts).toISOString().slice(0, 10)
  if (days === 0) return { relative: 'Today', absolute }
  if (days === 1) return { relative: 'Tomorrow', absolute }
  if (days === -1) return { relative: 'Yesterday', absolute }
  if (days > 0) return { relative: `+${days}d`, absolute }
  return { relative: `${days}d`, absolute }
}
