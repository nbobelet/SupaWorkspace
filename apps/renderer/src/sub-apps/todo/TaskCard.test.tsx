import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Task } from '@shared/todo'
import { TaskCard } from './TaskCard'

const task: Task = {
  kind: 'todo',
  id: 'task-1',
  title: 'Selectable text',
  description: '',
  columnId: 'created',
  createdAt: 0,
  dateStarted: 0,
  dateDone: null,
  dateArchive: null,
  severity: 'medium',
  deadline: null,
}

function render(): string {
  return renderToStaticMarkup(
    <DndContext>
      <SortableContext items={[task.id]}>
        <TaskCard
          task={task}
          selected={false}
          selectionCount={0}
          onOpen={() => {}}
          onToggleSelect={() => {}}
          onRangeSelect={() => {}}
          onClearSelection={() => {}}
          onAction={() => {}}
        />
      </SortableContext>
    </DndContext>,
  )
}

describe('TaskCard text-selection guard', () => {
  // Regression: marquee drag / shift+click / right-click used to leave the
  // browser's native text selection highlighting the task title. The card must
  // opt out of user-select so selection gestures never highlight its text.
  it('disables native text selection on the card', () => {
    expect(render()).toContain('select-none')
  })
})
