import { useEffect, useRef, useState, type ReactElement } from 'react'

interface WorkdirPromptProps {
  workspaceName: string
  initialValue: string
  /** Trimmed path, or null when the field is blank (clears the workdir). */
  onSubmit: (value: string | null) => void
  onClose: () => void
}

/**
 * Modal for editing a workspace's working directory. Replaces `window.prompt`,
 * which is a silent no-op in the Electron renderer (so the old "Set workdir"
 * menu item did nothing). A real DOM input also lets us hint that WSL sessions
 * accept a native Linux path.
 */
export function WorkdirPrompt({
  workspaceName,
  initialValue,
  onSubmit,
  onClose,
}: WorkdirPromptProps): ReactElement {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const commit = (): void => {
    const trimmed = value.trim()
    onSubmit(trimmed === '' ? null : trimmed)
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Set working directory for ${workspaceName}`}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      {/* biome/eslint: backdrop click closes; inner click must not bubble to it */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[28rem] max-w-[90vw] rounded-md border border-border bg-bg-elevated p-4 shadow-lg"
      >
        <h2 className="mb-1 text-sm font-medium text-fg">
          Working directory for “{workspaceName}”
        </h2>
        <p className="mb-3 text-[11px] text-muted">
          Blank to clear. WSL sessions accept a Linux path, e.g. /home/nico/proj.
        </p>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
          }}
          placeholder="/path/to/dir"
          aria-label="Working directory path"
          className="w-full rounded-sm bg-bg px-2 py-1 text-sm text-fg outline-none ring-1 ring-border focus:ring-accent"
        />
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm px-3 py-1 text-xs text-muted hover:text-fg"
          >
            Cancel
          </button>
          <button
            type="button"
            data-action="save-workdir"
            onClick={commit}
            className="rounded-sm bg-accent px-3 py-1 text-xs font-medium text-bg hover:opacity-90"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
