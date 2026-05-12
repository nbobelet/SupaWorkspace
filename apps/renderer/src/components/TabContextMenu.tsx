import { useEffect, useRef, type ReactElement } from 'react'
import { ArrowLeftRight, ArrowUpDown, Copy, Edit2, X } from 'lucide-react'

export type TabAction = 'split-h' | 'split-v' | 'rename' | 'duplicate' | 'close'

interface TabContextMenuProps {
  sessionId: string
  x: number
  y: number
  onAction: (action: TabAction) => void
  onClose: () => void
}

interface ActionDef {
  action: TabAction
  label: string
  icon: ReactElement
  shortcut?: string
  danger?: boolean
}

const ACTIONS: ActionDef[] = [
  {
    action: 'split-h',
    label: 'Split horizontal',
    icon: <ArrowUpDown size={12} aria-hidden="true" />,
    shortcut: 'Ctrl+Shift+-',
  },
  {
    action: 'split-v',
    label: 'Split vertical',
    icon: <ArrowLeftRight size={12} aria-hidden="true" />,
    shortcut: 'Ctrl+Shift+\\',
  },
  {
    action: 'rename',
    label: 'Rename',
    icon: <Edit2 size={12} aria-hidden="true" />,
    shortcut: 'F2',
  },
  {
    action: 'duplicate',
    label: 'Duplicate',
    icon: <Copy size={12} aria-hidden="true" />,
  },
  {
    action: 'close',
    label: 'Close',
    icon: <X size={12} aria-hidden="true" />,
    shortcut: 'Ctrl+W',
    danger: true,
  },
]

export function TabContextMenu({
  sessionId,
  x,
  y,
  onAction,
  onClose,
}: TabContextMenuProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const supportsPopover = 'popover' in HTMLElement.prototype
    if (supportsPopover) {
      try {
        el.showPopover()
      } catch {
        // Already open or hidden parent — ignore.
      }
    }
    const handleToggle = (event: Event): void => {
      const newState = (event as Event & { newState?: string }).newState
      if (newState === 'closed') onClose()
    }
    const handleKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    el.addEventListener('toggle', handleToggle)
    window.addEventListener('keydown', handleKey)
    return () => {
      el.removeEventListener('toggle', handleToggle)
      window.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Tab actions"
      popover="auto"
      style={{ left: x, top: y, margin: 0, inset: 'auto' }}
      className="fixed z-50 min-w-[200px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg outline-none"
      onClick={(event) => event.stopPropagation()}
      data-session-id={sessionId}
    >
      <ul className="flex flex-col">
        {ACTIONS.map((a) => (
          <li key={a.action}>
            <button
              type="button"
              role="menuitem"
              autoFocus={a.action === 'split-h'}
              onClick={() => onAction(a.action)}
              className={[
                'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                a.danger ? 'text-error hover:bg-error/10' : 'text-fg hover:bg-bg',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                {a.icon}
                <span>{a.label}</span>
              </span>
              {a.shortcut && (
                <kbd className="font-mono text-[10px] text-muted">{a.shortcut}</kbd>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
