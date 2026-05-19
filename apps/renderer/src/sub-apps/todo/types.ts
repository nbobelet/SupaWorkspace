import type { Column, Task, TaskSeverity, TodoState } from '@shared/todo'

export type { Column, Task, TaskSeverity, TodoState }

export interface TodoToastState {
  message: string
  /** Increment-only counter used as the toast's React key. */
  seq: number
  variant: 'info' | 'success' | 'warning'
  /** Optional undo callback — when present, the toast renders an Undo button. */
  undo?: () => void
}
