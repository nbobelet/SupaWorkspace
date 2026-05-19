import { Plus, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { ARCHIVE_COLUMN_ID, type Column, type TodoState } from '@shared/todo'
import { ColumnEditor } from './ColumnEditor'
import { DeleteColumnDialog } from './DeleteColumnDialog'

export interface SettingsTabProps {
  state: TodoState
  onSave: (columns: Column[]) => void | Promise<void>
  onClose: () => void
}

const DEFAULT_NEW_COLOR = '#a78bfa'

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 31)
  return base
}

function ensureUniqueId(base: string, existing: ReadonlySet<string>): string {
  if (base.length === 0) return ensureUniqueId('col', existing)
  if (!existing.has(base)) return base
  let i = 2
  while (existing.has(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export function SettingsTab({ state, onSave, onClose }: SettingsTabProps): ReactElement {
  const [columns, setColumns] = useState<Column[]>(() =>
    [...state.columns].sort((a, b) => a.order - b.order),
  )
  const [newName, setNewName] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Column | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setColumns([...state.columns].sort((a, b) => a.order - b.order))
  }, [state.columns])

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && pendingDelete === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, pendingDelete])

  const taskCountByCol = useMemo(() => {
    const out = new Map<string, number>()
    for (const [colId, ids] of Object.entries(state.columnOrder)) out.set(colId, ids.length)
    return out
  }, [state.columnOrder])

  const isDirty = useMemo(() => {
    if (columns.length !== state.columns.length) return true
    const prevById = new Map(state.columns.map((c) => [c.id, c]))
    for (const c of columns) {
      const prev = prevById.get(c.id)
      if (!prev) return true
      if (prev.name !== c.name || prev.color !== c.color || prev.order !== c.order) return true
    }
    return false
  }, [columns, state.columns])

  const addColumn = (): void => {
    const trimmed = newName.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    const existing = new Set(columns.map((c) => c.id))
    const id = ensureUniqueId(slugify(trimmed), existing)
    setColumns((prev) => [
      ...prev,
      {
        id,
        name: trimmed.slice(0, 60),
        color: DEFAULT_NEW_COLOR,
        order: prev.length,
        builtin: false,
      },
    ])
    setNewName('')
    setError(null)
  }

  const updateColumn = (next: Column): void => {
    setColumns((prev) => prev.map((c) => (c.id === next.id ? next : c)))
  }

  const requestDelete = (col: Column): void => {
    if (col.id === ARCHIVE_COLUMN_ID) return
    setPendingDelete(col)
  }

  const confirmDelete = (): void => {
    if (!pendingDelete) return
    setColumns((prev) =>
      prev.filter((c) => c.id !== pendingDelete.id).map((c, i) => ({ ...c, order: i })),
    )
    setPendingDelete(null)
  }

  const save = async (): Promise<void> => {
    const normalised = columns.map((c, i) => ({ ...c, order: i }))
    const seenIds = new Set<string>()
    for (const c of normalised) {
      if (seenIds.has(c.id)) {
        setError(`Duplicate column id: ${c.id}`)
        return
      }
      if (!c.name.trim()) {
        setError(`Column "${c.id}" needs a name`)
        return
      }
      seenIds.add(c.id)
    }
    try {
      await onSave(normalised)
      onClose()
    } catch (err) {
      console.error('[todo] saveColumns failed', err)
      setError('Save failed — see console')
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="TODO settings"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pendingDelete) onClose()
      }}
    >
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-md border border-border bg-bg-elevated p-4 text-sm">
        <header className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">TODO settings</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-muted hover:text-fg"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <section className="flex flex-col gap-2">
          <h3 className="text-[11px] uppercase tracking-wider text-muted">Columns</h3>
          <ul className="flex flex-col gap-1.5">
            {columns.map((col) => (
              <ColumnEditor
                key={col.id}
                column={col}
                taskCount={taskCountByCol.get(col.id) ?? 0}
                onChange={updateColumn}
                onRequestDelete={() => requestDelete(col)}
              />
            ))}
          </ul>
        </section>

        <section className="flex items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New column name"
            maxLength={60}
            className="min-w-0 flex-1 rounded-sm border border-border bg-bg-sunken px-2 py-1 text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter') addColumn()
            }}
          />
          <button
            type="button"
            onClick={addColumn}
            className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/10 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            <Plus size={12} aria-hidden="true" />
            Add column
          </button>
        </section>

        {error && (
          <p role="alert" className="rounded-sm bg-error/10 px-2 py-1 text-xs text-error">
            {error}
          </p>
        )}

        <footer className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-border bg-bg-sunken px-3 py-1 text-xs hover:border-border-strong"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={!isDirty}
            className={[
              'rounded-sm border px-3 py-1 text-xs font-semibold',
              isDirty
                ? 'border-accent bg-accent/10 text-accent hover:bg-accent/20'
                : 'cursor-not-allowed border-border text-muted',
            ].join(' ')}
          >
            Save
          </button>
        </footer>
      </div>

      {pendingDelete && (
        <DeleteColumnDialog
          columnName={pendingDelete.name}
          taskCount={taskCountByCol.get(pendingDelete.id) ?? 0}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  )
}
