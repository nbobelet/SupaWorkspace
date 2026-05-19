import type { ReactElement } from 'react'

export interface DeleteColumnDialogProps {
  columnName: string
  taskCount: number
  onConfirm: () => void
  onCancel: () => void
}

export function DeleteColumnDialog({
  columnName,
  taskCount,
  onConfirm,
  onCancel,
}: DeleteColumnDialogProps): ReactElement {
  const message =
    taskCount === 0
      ? `Delete column "${columnName}"?`
      : `Move ${taskCount} task${taskCount === 1 ? '' : 's'} to archive and delete column "${columnName}"?`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm column deletion"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="flex w-full max-w-sm flex-col gap-3 rounded-md border border-border bg-bg-elevated p-4 text-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Delete column</h2>
        <p>{message}</p>
        <footer className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm border border-border bg-bg-sunken px-3 py-1 text-xs hover:border-border-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-sm border border-error/40 bg-error/10 px-3 py-1 text-xs font-semibold text-error hover:border-error"
          >
            Delete
          </button>
        </footer>
      </div>
    </div>
  )
}
