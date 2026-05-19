import type { ReactElement } from 'react'
import { ArrowLeftRight, ArrowUpDown, Copy, Edit2, X, XSquare } from 'lucide-react'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

export type TabAction = 'split-h' | 'split-v' | 'rename' | 'duplicate' | 'close' | 'close-all-ws'

interface TabContextMenuProps {
  sessionId: string
  x: number
  y: number
  onAction: (action: TabAction) => void
  onClose: () => void
}

const ACTIONS: ContextMenuItem<TabAction>[] = [
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
  {
    action: 'close-all-ws',
    label: 'Close all in workspace',
    icon: <XSquare size={12} aria-hidden="true" />,
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
  return (
    <div data-session-id={sessionId} className="contents">
      <ContextMenu<TabAction>
        x={x}
        y={y}
        items={ACTIONS}
        onAction={onAction}
        onClose={onClose}
        ariaLabel="Tab actions"
      />
    </div>
  )
}
