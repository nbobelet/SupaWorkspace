import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { ExternalLink, FolderOpen } from 'lucide-react'
import type { FileEntry } from '@shared/ipc'

export interface ExplorerContextMenuProps {
  /** Workspace whose `window.ws.explorer.*` channels the actions target. */
  workspaceId: string
  /** Row the menu was opened on. `type` decides which items appear. */
  entry: FileEntry
  /** Workspace-relative POSIX path of `entry` (pre-derived by MillerColumns). */
  relPath: string
  /** Anchor: the contextmenu event coordinates. Clamped within the viewport. */
  position: { clientX: number; clientY: number }
  /** Close request — outside click, Escape, blur, or after an action fires. */
  onClose: () => void
}

interface MenuAction {
  id: string
  label: string
  icon: ReactElement
  run: () => void
}

/** Estimated menu size used to clamp the anchor before the first paint so the
 * menu never spawns off-screen. Refined to the measured size post-mount. */
const ESTIMATED_WIDTH = 224
const ESTIMATED_HEIGHT = 88
const VIEWPORT_MARGIN = 8

function clampToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
): { left: number; top: number } {
  const maxLeft = window.innerWidth - width - VIEWPORT_MARGIN
  const maxTop = window.innerHeight - height - VIEWPORT_MARGIN
  return {
    left: Math.max(VIEWPORT_MARGIN, Math.min(x, maxLeft)),
    top: Math.max(VIEWPORT_MARGIN, Math.min(y, maxTop)),
  }
}

/**
 * Right-click menu for an Explorer row. Files get "Open" (OS default app) +
 * "Reveal in file manager"; folders get "Reveal in file manager" only. All
 * styling is token-driven (`bg-bg-elevated`, `border-border`, `text-fg*`,
 * `bg-accent/*`) so it re-themes with the rest of the UI — no hardcoded hex.
 *
 * a11y: `role="menu"` / `role="menuitem"`, roving focus seeded on the first
 * item, Up/Down to move, Enter/Space to activate, Escape + outside click +
 * blur to dismiss. Anchored at the event coords, clamped within the viewport.
 */
export function ExplorerContextMenu({
  workspaceId,
  entry,
  relPath,
  position,
  onClose,
}: ExplorerContextMenuProps): ReactElement {
  const menuRef = useRef<HTMLDivElement>(null)
  const [coords, setCoords] = useState(() =>
    clampToViewport(position.clientX, position.clientY, ESTIMATED_WIDTH, ESTIMATED_HEIGHT),
  )
  const [activeIndex, setActiveIndex] = useState(0)

  const open = useCallback(() => {
    void window.ws.explorer.open(workspaceId, relPath)
    onClose()
  }, [workspaceId, relPath, onClose])

  const reveal = useCallback(() => {
    void window.ws.explorer.reveal(workspaceId, relPath)
    onClose()
  }, [workspaceId, relPath, onClose])

  const actions: MenuAction[] = useMemo(() => {
    const revealAction: MenuAction = {
      id: 'reveal',
      label: 'Reveal in file manager',
      icon: <FolderOpen size={14} aria-hidden="true" />,
      run: reveal,
    }
    if (entry.type === 'file') {
      return [
        {
          id: 'open',
          label: 'Open',
          icon: <ExternalLink size={14} aria-hidden="true" />,
          run: open,
        },
        revealAction,
      ]
    }
    return [revealAction]
  }, [entry.type, open, reveal])

  // Re-clamp against the measured size + seed focus on the first item.
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords(clampToViewport(position.clientX, position.clientY, rect.width, rect.height))
    el.focus()
  }, [position.clientX, position.clientY])

  // Dismiss on any outside pointer interaction.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent): void => {
      if (!menuRef.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  }, [onClose])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          onClose()
          break
        case 'ArrowDown':
          event.preventDefault()
          setActiveIndex((i) => (i + 1) % actions.length)
          break
        case 'ArrowUp':
          event.preventDefault()
          setActiveIndex((i) => (i - 1 + actions.length) % actions.length)
          break
        case 'Home':
          event.preventDefault()
          setActiveIndex(0)
          break
        case 'End':
          event.preventDefault()
          setActiveIndex(actions.length - 1)
          break
        case 'Enter':
        case ' ':
          event.preventDefault()
          actions[activeIndex]?.run()
          break
        default:
          break
      }
    },
    [actions, activeIndex, onClose],
  )

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions for ${entry.name}`}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        if (!menuRef.current?.contains(event.relatedTarget as Node | null)) onClose()
      }}
      style={{ left: coords.left, top: coords.top, minWidth: ESTIMATED_WIDTH }}
      className="supa-scroll fixed z-50 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-bg-elevated p-1 text-xs shadow-lg shadow-black/30 outline-none"
    >
      {actions.map((action, index) => {
        const active = index === activeIndex
        return (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            tabIndex={-1}
            onMouseEnter={() => setActiveIndex(index)}
            onClick={action.run}
            className={[
              'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left',
              active ? 'bg-accent/15 text-fg' : 'text-fg-subtle hover:text-fg',
            ].join(' ')}
          >
            <span className="shrink-0 text-muted">{action.icon}</span>
            <span className="min-w-0 flex-1 truncate">{action.label}</span>
          </button>
        )
      })}
    </div>
  )
}
