import { describe, expect, it } from 'vitest'
import { defaultTodoState, type Task, type TodoState } from '@shared/todo'
import { mergeTodoStates } from './aggregate'

function task(id: string, columnId: string, title: string): Task {
  return {
    kind: 'todo',
    id,
    title,
    description: '',
    columnId,
    createdAt: 0,
    dateStarted: 0,
    dateDone: null,
    dateArchive: null,
    severity: null,
    deadline: null,
  }
}

function stateWith(tasks: Task[]): TodoState {
  const base = defaultTodoState()
  const columnOrder: Record<string, string[]> = { ...base.columnOrder }
  for (const t of tasks) columnOrder[t.columnId] = [...(columnOrder[t.columnId] ?? []), t.id]
  return { ...base, tasks, columnOrder }
}

const A = '00000000-0000-4000-8000-000000000001' // home
const B = '11111111-1111-4111-8111-111111111111'

describe('mergeTodoStates', () => {
  it('aggregates tasks from every workspace and tags their origin', () => {
    const home = stateWith([task('t1', 'created', 'home task')])
    const proj = stateWith([task('t2', 'running', 'proj task')])

    const { state, originOf } = mergeTodoStates(
      [
        { workspaceId: A, state: home },
        { workspaceId: B, state: proj },
      ],
      home,
    )

    expect(state.tasks.map((t) => t.id).sort()).toEqual(['t1', 't2'])
    expect(state.columnOrder['created']).toContain('t1')
    expect(state.columnOrder['running']).toContain('t2')
    expect(originOf.get('t1')).toBe(A)
    expect(originOf.get('t2')).toBe(B)
  })

  it('keeps each task attributed to its owning workspace (no scope stripping)', () => {
    const home = stateWith([])
    const proj = stateWith([task('t9', 'done', 'done elsewhere')])
    const { originOf } = mergeTodoStates(
      [
        { workspaceId: A, state: home },
        { workspaceId: B, state: proj },
      ],
      home,
    )
    expect(originOf.get('t9')).toBe(B)
  })
})
