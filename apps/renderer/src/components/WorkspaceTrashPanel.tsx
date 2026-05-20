import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { WORKSPACE_RETENTION_MS, type Workspace } from '@shared/workspace'

interface WorkspaceTrashPanelProps {
  onClose: () => void
  /** Refresh the active workspace list after a restore moves an entry back. */
  onRestored: (workspace: Workspace) => void
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Days left before a soft-deleted workspace auto-purges (floored at 0). */
function daysUntilPurge(deletedAt: number): number {
  const remaining = deletedAt + WORKSPACE_RETENTION_MS - Date.now()
  return Math.max(0, Math.ceil(remaining / DAY_MS))
}

export function WorkspaceTrashPanel({
  onClose,
  onRestored,
}: WorkspaceTrashPanelProps): ReactElement {
  const [deleted, setDeleted] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const res = await window.ws.workspace.listDeleted()
    setDeleted(res.workspaces)
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const restore = useCallback(
    async (ws: Workspace) => {
      const updated = await window.ws.workspace.restore(ws.id)
      onRestored(updated)
      await refresh()
      toast.success(`Restored "${updated.name}"`)
    },
    [onRestored, refresh],
  )

  const purge = useCallback(
    async (ws: Workspace) => {
      const ok = window.confirm(
        `Permanently delete "${ws.name}"?\n\nIts notes and TODO board will be erased. This cannot be undone.`,
      )
      if (!ok) return
      await window.ws.workspace.purge(ws.id)
      await refresh()
      toast.success(`Deleted "${ws.name}" permanently`)
    },
    [refresh],
  )

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-trash-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-md border border-border bg-bg-elevated p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="workspace-trash-title" className="text-sm font-semibold text-fg">
          Recently deleted
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Restore a workspace or delete it for good. Trashed workspaces auto-delete after 30 days.
        </p>

        <ul className="supa-scroll mt-3 max-h-80 overflow-y-auto">
          {loading && <li className="px-1 py-2 text-xs text-muted">Loading…</li>}
          {!loading && deleted.length === 0 && (
            <li className="px-1 py-2 text-xs text-muted">Trash is empty.</li>
          )}
          {deleted.map((ws) => (
            <li
              key={ws.id}
              className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-b-0"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-fg">{ws.name}</div>
                <div className="truncate text-[11px] text-fg-subtle">
                  {ws.rootPath ?? 'no path'} · auto-deletes in{' '}
                  {daysUntilPurge(ws.deletedAt ?? Date.now())} days
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => void restore(ws)}
                  title="Restore"
                  aria-label={`Restore ${ws.name}`}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg px-2 py-1 text-xs hover:border-border-strong"
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  Restore
                </button>
                <button
                  type="button"
                  onClick={() => void purge(ws)}
                  title="Delete permanently"
                  aria-label={`Delete ${ws.name} permanently`}
                  className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg px-2 py-1 text-xs text-error hover:border-error"
                >
                  <Trash2 size={12} aria-hidden="true" />
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border bg-bg px-3 py-1.5 text-xs hover:border-border-strong"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
