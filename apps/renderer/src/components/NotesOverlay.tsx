import { useEffect, useRef, type ReactElement } from 'react'
import { X } from 'lucide-react'
import { NotesPanel } from './NotesPanel'

interface NotesOverlayProps {
  workspaceId: string
  onClose: () => void
}

// Sidebar-anchored Notes overlay. Positioned right of the 240px-wide aside,
// closes on Escape, outside-pointerdown, or window blur. Reuses `NotesPanel`
// so the same editor surface serves the sidebar shortcut AND the settings
// route entry (`NotesTab`).
export function NotesOverlay({ workspaceId, onClose }: NotesOverlayProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const el = ref.current
      if (!el) return
      if (event.target instanceof Node && el.contains(event.target)) return
      onClose()
    }
    const onBlur = (): void => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Workspace notes"
      className="fixed left-60 top-0 z-40 flex h-screen w-96 flex-col border-r border-border bg-bg-sunken p-2 shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Notes</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close notes overlay"
          className="rounded-sm p-1 text-muted hover:text-fg"
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <NotesPanel workspaceId={workspaceId} />
      </div>
    </div>
  )
}
