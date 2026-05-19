import { z } from 'zod'

export const TaskSeverity = z.enum(['low', 'medium', 'high'])
export type TaskSeverity = z.infer<typeof TaskSeverity>

export const TaskKind = z.enum(['todo', 'fix'])
export type TaskKind = z.infer<typeof TaskKind>

const TaskBase = {
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().max(10_000),
  columnId: z.string().min(1),
  createdAt: z.number().int(),
  dateStarted: z.number().int(),
  dateDone: z.number().int().nullable(),
  dateArchive: z.number().int().nullable(),
  severity: TaskSeverity.nullable(),
  deadline: z.number().int().nullable(),
}

const TodoTask = z.object({
  kind: z.literal('todo'),
  ...TaskBase,
})
export type TodoTask = z.infer<typeof TodoTask>

const FixTask = z.object({
  kind: z.literal('fix'),
  ...TaskBase,
})
export type FixTask = z.infer<typeof FixTask>

export const Task = z.discriminatedUnion('kind', [TodoTask, FixTask])
export type Task = z.infer<typeof Task>

export const HexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, 'expected 6-digit hex color')
export type HexColor = z.infer<typeof HexColor>

/**
 * Stable column slug used as map key, dnd-kit droppable id, and CSS token
 * suffix (`--color-state-<id>`). Lowercase ASCII to keep the token name
 * cross-platform safe.
 */
export const ColumnId = z.string().regex(/^[a-z0-9][a-z0-9-]{0,30}$/)
export type ColumnId = z.infer<typeof ColumnId>

export const Column = z.object({
  id: ColumnId,
  name: z.string().trim().min(1).max(60),
  color: HexColor,
  order: z.number().int().min(0),
  /**
   * Built-in columns are seeded by the store and surface in the settings
   * UI as non-renameable / non-deletable when `id === 'archive'`. The
   * archive column is the destination for delete-column-with-tasks and
   * cannot itself be removed.
   */
  builtin: z.boolean(),
})
export type Column = z.infer<typeof Column>

export const TODO_SCHEMA_VERSION = 2 as const

export const TodoState = z.object({
  schemaVersion: z.literal(TODO_SCHEMA_VERSION),
  columns: z.array(Column).min(1),
  tasks: z.array(Task),
  /**
   * Ordered task ids per column — single source of truth for drag/drop
   * order. Tasks present in `tasks` but absent from any column array are
   * tolerated at load time (auto-appended to their `columnId`) so a
   * partial repair never throws.
   */
  columnOrder: z.record(ColumnId, z.array(z.string().uuid())),
})
export type TodoState = z.infer<typeof TodoState>

export const DEFAULT_COLUMNS: readonly Column[] = [
  { id: 'created', name: 'Created', color: '#94a3b8', order: 0, builtin: true },
  { id: 'running', name: 'Running', color: '#3b82f6', order: 1, builtin: true },
  { id: 'done', name: 'Done', color: '#22c55e', order: 2, builtin: true },
  { id: 'archive', name: 'Archive', color: '#64748b', order: 3, builtin: true },
] as const

export const ARCHIVE_COLUMN_ID = 'archive' as const

export function defaultTodoState(): TodoState {
  return {
    schemaVersion: TODO_SCHEMA_VERSION,
    columns: DEFAULT_COLUMNS.map((c) => ({ ...c })),
    tasks: [],
    columnOrder: Object.fromEntries(DEFAULT_COLUMNS.map((c) => [c.id, []])),
  }
}
