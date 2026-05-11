import { useEffect, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Pencil, Palette, Trash2 } from 'lucide-react'
import type { Workspace } from '@shared/workspace'

const PALETTE_HUES = [15, 45, 95, 145, 195, 230, 270, 310]

interface WorkspaceSettingsMenuProps {
  workspace: Workspace
  onRename: () => void
  onChangeColor: (hue: number) => void
  onDelete: () => void
  onClose: () => void
}

export function WorkspaceSettingsMenu({
  workspace,
  onRename,
  onChangeColor,
  onDelete,
  onClose,
}: WorkspaceSettingsMenuProps): ReactElement {
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  const activeHue = workspace.color?.hue

  const confirmDelete = (): void => {
    onClose()
    toast(`Delete workspace "${workspace.name}"?`, {
      description: 'Active sessions will be terminated. This cannot be undone.',
      duration: 8000,
      action: {
        label: 'Delete',
        onClick: onDelete,
      },
      cancel: {
        label: 'Cancel',
        onClick: () => undefined,
      },
    })
  }

  return (
    <div
      role="dialog"
      aria-label={`Settings for ${workspace.name}`}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-2 top-12 z-40 w-56 rounded-md border border-border bg-bg-elevated shadow-lg"
    >
      <div className="border-b border-border px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted">
        Settings
      </div>
      <button
        type="button"
        onClick={() => {
          onClose()
          onRename()
        }}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-fg hover:bg-bg"
      >
        <Pencil size={14} aria-hidden="true" />
        <span>Rename</span>
      </button>
      <div className="px-3 py-1.5">
        <div className="mb-1.5 flex items-center gap-2 text-xs text-fg-subtle">
          <Palette size={14} aria-hidden="true" />
          <span>Color</span>
        </div>
        <div className="grid grid-cols-8 gap-1">
          {PALETTE_HUES.map((hue) => {
            const isActive = activeHue === hue
            return (
              <button
                key={hue}
                type="button"
                onClick={() => {
                  onClose()
                  onChangeColor(hue)
                }}
                aria-label={`Set color to hue ${hue}`}
                aria-pressed={isActive}
                style={{ background: `oklch(70% 0.15 ${hue}deg)` }}
                className={[
                  'h-5 w-5 rounded-full transition-transform',
                  isActive ? 'ring-2 ring-fg ring-offset-2 ring-offset-bg-elevated' : 'hover:scale-110',
                ].join(' ')}
              />
            )
          })}
        </div>
      </div>
      <button
        type="button"
        onClick={confirmDelete}
        className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left text-xs text-error hover:bg-error/10"
      >
        <Trash2 size={14} aria-hidden="true" />
        <span>Delete workspace</span>
      </button>
    </div>
  )
}
