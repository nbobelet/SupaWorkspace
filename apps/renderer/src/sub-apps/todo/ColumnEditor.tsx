import { Trash2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { ARCHIVE_COLUMN_ID, type Column } from '@shared/todo'

export interface ColumnEditorProps {
  column: Column
  taskCount: number
  onChange: (next: Column) => void
  onRequestDelete: () => void
}

export function ColumnEditor({
  column,
  taskCount,
  onChange,
  onRequestDelete,
}: ColumnEditorProps): ReactElement {
  const isArchive = column.id === ARCHIVE_COLUMN_ID

  return (
    <li className="flex items-center gap-2 rounded-sm border border-border bg-bg-sunken px-2 py-1.5">
      <input
        type="color"
        value={column.color}
        onChange={(e) => onChange({ ...column, color: e.target.value })}
        aria-label={`Color for column ${column.name}`}
        className="h-6 w-6 shrink-0 cursor-pointer rounded-sm border border-border bg-transparent p-0"
      />
      <input
        type="text"
        value={column.name}
        onChange={(e) => onChange({ ...column, name: e.target.value })}
        maxLength={60}
        aria-label={`Name for column ${column.name}`}
        className="min-w-0 flex-1 rounded-sm border border-border bg-bg-elevated px-2 py-1 text-xs"
      />
      <span
        className="shrink-0 rounded-sm bg-bg-elevated px-1.5 py-0.5 text-[10px] text-muted"
        aria-label={`${taskCount} tasks in this column`}
      >
        {taskCount}
      </span>
      <button
        type="button"
        onClick={onRequestDelete}
        disabled={isArchive}
        aria-label={isArchive ? 'Archive column cannot be deleted' : `Delete column ${column.name}`}
        title={isArchive ? 'Archive cannot be deleted' : `Delete ${column.name}`}
        className={[
          'shrink-0 rounded-sm border p-1',
          isArchive
            ? 'cursor-not-allowed border-border text-muted/60'
            : 'border-error/40 text-error hover:border-error hover:bg-error/10',
        ].join(' ')}
      >
        <Trash2 size={12} aria-hidden="true" />
      </button>
    </li>
  )
}
