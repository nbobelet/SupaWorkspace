import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { Plus } from 'lucide-react'
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type RefObject,
} from 'react'
import type { Column, Task, TaskSeverity } from '@shared/todo'
import { clampMenuPosition, VIEWPORT_MARGIN } from '../../lib/menuPosition'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { TaskCard } from './TaskCard'
import { useTodoStore } from './store'

export interface KanbanColumnProps {
  column: Column
  tasks: Task[]
  taskIds: string[]
  onOpenTask: (task: Task) => void
}

/** Severity applied to tasks created via the column quick-add. */
const DEFAULT_SEVERITY: TaskSeverity = 'low'

type ColumnAction = 'add-task'

interface CursorPoint {
  x: number
  y: number
}

export function KanbanColumn({ column, tasks, taskIds, onOpenTask }: KanbanColumnProps): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  })

  const createTask = useTodoStore((s) => s.createTask)

  const [menuAt, setMenuAt] = useState<CursorPoint | null>(null)
  const [composerAt, setComposerAt] = useState<CursorPoint | null>(null)

  // Right-click on the empty column area only — clicks bubbling from a task
  // card (or any descendant button/link) carry their own context and must not
  // trigger the quick-add. `currentTarget` is the element wearing this handler,
  // so an exact-match target means the bare drop area was hit.
  const handleContextMenu = (event: ReactMouseEvent<HTMLElement>): void => {
    if (event.target !== event.currentTarget) return
    event.preventDefault()
    setComposerAt(null)
    setMenuAt({ x: event.clientX, y: event.clientY })
  }

  const openComposer = (): void => {
    const at = menuAt
    setMenuAt(null)
    if (at) setComposerAt(at)
  }

  const submitComposer = async (title: string): Promise<void> => {
    const trimmed = title.trim()
    if (!trimmed) {
      setComposerAt(null)
      return
    }
    const workspaceId = useWorkspaceStore.getState().activeWorkspaceId
    if (!workspaceId) {
      setComposerAt(null)
      return
    }
    const now = Date.now()
    const task: Task = {
      kind: 'todo',
      id: crypto.randomUUID(),
      title: trimmed,
      description: '',
      columnId: column.id,
      createdAt: now,
      dateStarted: now,
      dateDone: null,
      dateArchive: null,
      severity: DEFAULT_SEVERITY,
      deadline: null,
    }
    try {
      await createTask(workspaceId, task)
    } catch (err) {
      console.error('[todo] quick-add failed', err)
    } finally {
      setComposerAt(null)
    }
  }

  return (
    <section
      ref={setNodeRef}
      aria-label={`${column.name} column`}
      className={[
        'flex h-full w-72 shrink-0 flex-col rounded-md border border-border bg-bg-sunken',
        isOver ? 'border-accent ring-1 ring-accent' : '',
      ].join(' ')}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: column.color }}
          />
          <span className="truncate text-sm font-semibold">{column.name}</span>
        </span>
        <span
          className="shrink-0 rounded-sm bg-bg-elevated px-1.5 py-px text-[10px] font-medium text-muted"
          aria-label={`${tasks.length} tasks`}
        >
          {tasks.length}
        </span>
      </header>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <ul
          className="supa-scroll flex flex-1 flex-col gap-2 overflow-y-auto p-2"
          onContextMenu={handleContextMenu}
        >
          {tasks.length === 0 ? (
            <li
              className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-xs text-muted"
              onContextMenu={handleContextMenu}
            >
              Empty
            </li>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)
          )}
        </ul>
      </SortableContext>

      {menuAt && (
        <ColumnContextMenu
          x={menuAt.x}
          y={menuAt.y}
          ariaLabel={`${column.name} column actions`}
          onAction={openComposer}
          onClose={() => setMenuAt(null)}
        />
      )}

      {composerAt && (
        <InlineComposer
          x={composerAt.x}
          y={composerAt.y}
          ariaLabel={`Add task to ${column.name}`}
          onSubmit={(title) => void submitComposer(title)}
          onCancel={() => setComposerAt(null)}
        />
      )}
    </section>
  )
}

interface ColumnContextMenuProps {
  x: number
  y: number
  ariaLabel: string
  onAction: (action: ColumnAction) => void
  onClose: () => void
}

function ColumnContextMenu({ x, y, ariaLabel, onAction, onClose }: ColumnContextMenuProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const position = useClampedPosition(ref, x, y)
  useDismissOnOutside(ref, onClose)

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
      className="fixed z-50 min-w-[180px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg outline-none"
    >
      <ul className="flex flex-col">
        <li>
          <button
            type="button"
            role="menuitem"
            autoFocus
            onClick={() => onAction('add-task')}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <Plus size={12} aria-hidden="true" />
            <span>Add task</span>
          </button>
        </li>
      </ul>
    </div>
  )
}

interface InlineComposerProps {
  x: number
  y: number
  ariaLabel: string
  onSubmit: (title: string) => void
  onCancel: () => void
}

function InlineComposer({ x, y, ariaLabel, onSubmit, onCancel }: InlineComposerProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState('')
  const position = useClampedPosition(ref, x, y)
  useDismissOnOutside(ref, onCancel)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault()
      onSubmit(value)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onCancel()
    }
  }

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={ariaLabel}
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
      className="fixed z-50 w-64 rounded-md border border-border bg-bg-elevated p-2 shadow-lg"
    >
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => onSubmit(value)}
        placeholder="Task title…"
        maxLength={200}
        aria-label={ariaLabel}
        className="w-full rounded-sm border border-border bg-bg-sunken px-2 py-1 text-sm outline-none focus:border-accent"
      />
    </div>
  )
}

interface ClampedPosition {
  left: number
  top: number
  ready: boolean
}

/**
 * Render at the raw cursor coords first (hidden), measure, then clamp into the
 * viewport — avoids the one-frame flash of an overflowing popup before it snaps
 * back inside the screen.
 */
function useClampedPosition(
  ref: RefObject<HTMLElement | null>,
  x: number,
  y: number,
): ClampedPosition {
  const [position, setPosition] = useState<ClampedPosition>({ left: x, top: y, ready: false })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const clamped = clampMenuPosition({
      x,
      y,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: VIEWPORT_MARGIN,
    })
    setPosition({ ...clamped, ready: true })
  }, [ref, x, y])

  return position
}

function useDismissOnOutside(ref: RefObject<HTMLElement | null>, onClose: () => void): void {
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      const el = ref.current
      if (!el) return
      if (event.target instanceof Node && el.contains(event.target)) return
      onClose()
    }
    const onScroll = (): void => onClose()
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [ref, onClose])
}
