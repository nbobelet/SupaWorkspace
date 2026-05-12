import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { ArrowLeftRight, ArrowUpDown, Copy, Edit2, X } from 'lucide-react'
import { clampMenuPosition, VIEWPORT_MARGIN } from '../lib/menuPosition'

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
  // Render at the raw cursor coords first, then clamp once we know the menu size.
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition(
      clampMenuPosition({
        x,
        y,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: VIEWPORT_MARGIN,
      }),
    )
  }, [x, y])

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
    const onScroll = (): void => onClose()
    const onBlur = (): void => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Tab actions"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-[200px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg outline-none"
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
