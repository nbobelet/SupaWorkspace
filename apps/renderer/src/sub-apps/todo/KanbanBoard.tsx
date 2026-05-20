import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { ARCHIVE_COLUMN_ID, type Task, type TodoState } from '@shared/todo'
import { KanbanColumn } from './KanbanColumn'
import { resolveActionTargets } from './selection'
import { TASK_ACTIONS, type CardAction } from './taskActions'
import { useColumnSelection } from './useColumnSelection'
import { useTodoStore } from './store'

export interface KanbanBoardProps {
  workspaceId: string
  state: TodoState
  showArchive: boolean
  /**
   * When false, drag-reorder is suppressed (aggregated cross-workspace view):
   * a merged-list index cannot be mapped back to one workspace's column order.
   */
  reorderable?: boolean
  /** Optional filter applied to tasks before they reach a column. */
  filterTask?: (task: Task) => boolean
  onOpenTask: (task: Task) => void
}

export function KanbanBoard({
  workspaceId,
  state,
  showArchive,
  reorderable = true,
  filterTask,
  onOpenTask,
}: KanbanBoardProps): ReactElement {
  const reorder = useTodoStore((s) => s.reorder)
  const [activeId, setActiveId] = useState<string | null>(null)

  const { selectedIdsFor, clear, toggle, selectRange, setMarquee } = useColumnSelection()

  // Esc and any scroll dismiss the selection — a scrolled-away marquee result is
  // stale, and Esc is the expected escape hatch.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') clear()
    }
    const onScroll = (): void => clear()
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [clear])

  const tasksById = useMemo(() => new Map(state.tasks.map((t) => [t.id, t])), [state.tasks])

  const handleCardAction = useCallback(
    (action: CardAction, task: Task): void => {
      const def = TASK_ACTIONS[action]
      const targetIds = resolveActionTargets(def.scope, task.id, selectedIdsFor(task.columnId))
      const targets = targetIds
        .map((id) => tasksById.get(id))
        .filter((t): t is Task => t !== undefined)
      def.run({ clicked: task, targets, open: onOpenTask })
      if (def.scope === 'selection') clear()
    },
    [selectedIdsFor, tasksById, onOpenTask, clear],
  )

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const visibleColumns = useMemo(
    () =>
      state.columns
        .filter((c) => (c.id === ARCHIVE_COLUMN_ID ? showArchive : true))
        .sort((a, b) => a.order - b.order),
    [state.columns, showArchive],
  )

  const tasksByColumn = useMemo(() => {
    const byId = new Map(state.tasks.map((t) => [t.id, t]))
    const out = new Map<string, Task[]>()
    for (const col of visibleColumns) {
      const ids = state.columnOrder[col.id] ?? []
      const tasks: Task[] = []
      for (const id of ids) {
        const task = byId.get(id)
        if (!task) continue
        if (filterTask && !filterTask(task)) continue
        tasks.push(task)
      }
      out.set(col.id, tasks)
    }
    return out
  }, [state.columnOrder, state.tasks, visibleColumns, filterTask])

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id))
  }

  const handleDragEnd = (event: DragEndEvent): void => {
    setActiveId(null)
    if (!reorderable) return
    const { active, over } = event
    if (!over) return

    const taskId = String(active.id)
    const overId = String(over.id)

    const overIsColumn = state.columns.some((c) => c.id === overId)
    const targetColumnId = overIsColumn
      ? overId
      : (state.tasks.find((t) => t.id === overId)?.columnId ?? null)
    if (!targetColumnId) return

    const targetOrder = state.columnOrder[targetColumnId] ?? []
    const fromTask = state.tasks.find((t) => t.id === taskId)
    const fromColumnId = fromTask?.columnId ?? null

    let toIndex: number
    if (overIsColumn) {
      toIndex = targetOrder.filter((id) => id !== taskId).length
    } else {
      const baseIndex = targetOrder.indexOf(overId)
      if (baseIndex === -1) {
        toIndex = targetOrder.length
      } else if (fromColumnId === targetColumnId) {
        const fromIdx = targetOrder.indexOf(taskId)
        toIndex = fromIdx < baseIndex ? baseIndex : baseIndex
      } else {
        toIndex = baseIndex
      }
    }

    if (fromColumnId === targetColumnId) {
      const fromIdx = targetOrder.indexOf(taskId)
      if (fromIdx === toIndex) return
    }

    void reorder(workspaceId, taskId, targetColumnId, toIndex)
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        className="supa-scroll flex h-full gap-3 overflow-x-auto p-3"
        data-dragging={activeId !== null ? 'true' : 'false'}
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) clear()
        }}
      >
        {visibleColumns.map((column) => {
          const tasks = tasksByColumn.get(column.id) ?? []
          const taskIds = tasks.map((t) => t.id)
          return (
            <KanbanColumn
              key={column.id}
              column={column}
              tasks={tasks}
              taskIds={taskIds}
              selectedIds={selectedIdsFor(column.id)}
              onOpenTask={onOpenTask}
              onToggleSelect={(taskId) => toggle(column.id, taskId)}
              onRangeSelect={(taskId) => selectRange(column.id, taskIds, taskId)}
              onMarquee={(marquee, cards) => setMarquee(column.id, marquee, cards)}
              onClearSelection={clear}
              onCardAction={handleCardAction}
            />
          )
        })}
      </div>
    </DndContext>
  )
}
