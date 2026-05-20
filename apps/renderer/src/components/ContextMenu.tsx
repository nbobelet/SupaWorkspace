import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react'
import { clampMenuPosition, VIEWPORT_MARGIN } from '../lib/menuPosition'

export interface ContextMenuItem<A extends string> {
  action: A
  label: string
  icon?: ReactElement
  shortcut?: string
  danger?: boolean
  disabled?: boolean
}

interface ContextMenuProps<A extends string> {
  x: number
  y: number
  items: ContextMenuItem<A>[]
  onAction: (action: A) => void
  onClose: () => void
  ariaLabel: string
}

export function ContextMenu<A extends string>({
  x,
  y,
  items,
  onAction,
  onClose,
  ariaLabel,
}: ContextMenuProps<A>): ReactElement {
  const ref = useRef<HTMLDivElement>(null)
  // Render at the raw cursor coords first, then clamp once we know the menu size.
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y })

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index >= 0)
  const firstEnabled = enabledIndexes[0]

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

  const focusItemAt = (index: number): void => {
    const el = ref.current
    if (!el) return
    const buttons = el.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')
    const target = buttons[index]
    if (target) target.focus()
  }

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    if (enabledIndexes.length === 0) return
    const el = ref.current
    if (!el) return
    const buttons = Array.from(
      el.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)'),
    )
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault()
        const next = current < 0 ? 0 : (current + 1) % buttons.length
        focusItemAt(next)
        break
      }
      case 'ArrowUp': {
        event.preventDefault()
        const prev = current <= 0 ? buttons.length - 1 : current - 1
        focusItemAt(prev)
        break
      }
      case 'Home': {
        event.preventDefault()
        focusItemAt(0)
        break
      }
      case 'End': {
        event.preventDefault()
        focusItemAt(buttons.length - 1)
        break
      }
      default:
        break
    }
  }

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onMenuKeyDown}
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-[200px] select-none rounded-md border border-border bg-bg-elevated py-1 shadow-lg outline-none"
    >
      <ul className="flex flex-col">
        {items.map((item, index) => (
          <li key={item.action}>
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              autoFocus={index === firstEnabled}
              onClick={() => onAction(item.action)}
              className={[
                'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50',
                item.danger ? 'text-error hover:bg-error/10' : 'text-fg hover:bg-bg',
              ].join(' ')}
            >
              <span className="flex items-center gap-2">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.shortcut && (
                <kbd className="font-mono text-[10px] text-muted">{item.shortcut}</kbd>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
