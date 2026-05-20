import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { CalendarClock, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import { useState, type CSSProperties, type MouseEvent, type ReactElement } from 'react'
import type { Task, TaskSeverity } from '@shared/todo'
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu'
import { KindPill } from './KindPill'
import { useTodoStore } from './store'

export interface TaskCardProps {
  task: Task
  onOpen: (task: Task) => void
}

type CardAction = 'sev-low' | 'sev-medium' | 'sev-high' | 'edit' | 'delete'

const SEVERITY_LABEL: Record<TaskSeverity, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
}

const SEVERITY_COLOR_VAR: Record<TaskSeverity, string> = {
  low: 'var(--color-severity-low)',
  medium: 'var(--color-severity-medium)',
  high: 'var(--color-severity-high)',
}

const SEVERITY_ACTION: Record<TaskSeverity, CardAction> = {
  low: 'sev-low',
  medium: 'sev-medium',
  high: 'sev-high',
}

const SEVERITY_ORDER: TaskSeverity[] = ['low', 'medium', 'high']

function severityDot(severity: TaskSeverity): ReactElement {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: SEVERITY_COLOR_VAR[severity] }}
    />
  )
}

export function TaskCard({ task, onOpen }: TaskCardProps): ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { type: 'task', columnId: task.columnId },
  })

  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const deadline = task.deadline ? formatDeadline(task.deadline) : null
  const overdue =
    task.deadline !== null && task.deadline < Date.now() && task.dateDone === null

  const openMenu = (event: MouseEvent): void => {
    event.preventDefault()
    setMenu({ x: event.clientX, y: event.clientY })
  }

  const handleAction = (action: CardAction): void => {
    setMenu(null)
    if (action === 'edit') {
      onOpen(task)
      return
    }
    const workspaceId = findWorkspaceId(task.id)
    if (!workspaceId) return
    const store = useTodoStore.getState()
    if (action === 'delete') {
      void store.deleteTask(workspaceId, task)
      return
    }
    const severity = severityOfAction(action)
    if (severity && severity !== task.severity) {
      void store.updateTask(workspaceId, { ...task, severity })
    }
  }

  const items: ContextMenuItem<CardAction>[] = [
    ...SEVERITY_ORDER.map<ContextMenuItem<CardAction>>((sev) => ({
      action: SEVERITY_ACTION[sev],
      label: SEVERITY_LABEL[sev],
      icon: severityDot(sev),
      disabled: task.severity === sev,
    })),
    {
      action: 'edit',
      label: 'Edit',
      icon: <Pencil size={12} aria-hidden="true" />,
    },
    {
      action: 'delete',
      label: 'Delete',
      icon: <Trash2 size={12} aria-hidden="true" />,
      danger: true,
    },
  ]

  return (
    <li
      ref={setNodeRef}
      data-task-card=""
      style={style}
      className={[
        'group/card relative rounded-md border border-border bg-bg-elevated text-fg',
        'hover:border-border-strong focus-within:border-accent',
        isDragging ? 'z-10 shadow-lg' : '',
      ].join(' ')}
      onContextMenu={openMenu}
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

      {menu && (
        <ContextMenu<CardAction>
          x={menu.x}
          y={menu.y}
          items={items}
          onAction={handleAction}
          onClose={() => setMenu(null)}
          ariaLabel={`Task actions: ${task.title}`}
        />
      )}
    </li>
  )
}

function severityOfAction(action: CardAction): TaskSeverity | null {
  if (action === 'sev-low') return 'low'
  if (action === 'sev-medium') return 'medium'
  if (action === 'sev-high') return 'high'
  return null
}

function findWorkspaceId(taskId: string): string | null {
  const { byWorkspace } = useTodoStore.getState()
  for (const [workspaceId, state] of Object.entries(byWorkspace)) {
    if (state.tasks.some((t) => t.id === taskId)) return workspaceId
  }
  return null
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
