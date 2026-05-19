import { useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { ReactElement } from 'react'
import type { Column, Task } from '@shared/todo'
import { TaskCard } from './TaskCard'

export interface KanbanColumnProps {
  column: Column
  tasks: Task[]
  taskIds: string[]
  onOpenTask: (task: Task) => void
}

export function KanbanColumn({ column, tasks, taskIds, onOpenTask }: KanbanColumnProps): ReactElement {
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
    data: { type: 'column', columnId: column.id },
  })

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
        <ul className="flex flex-1 flex-col gap-2 overflow-y-auto p-2">
          {tasks.length === 0 ? (
            <li className="rounded-sm border border-dashed border-border px-3 py-6 text-center text-xs text-muted">
              Empty
            </li>
          ) : (
            tasks.map((task) => <TaskCard key={task.id} task={task} onOpen={onOpenTask} />)
          )}
        </ul>
      </SortableContext>
    </section>
  )
}
