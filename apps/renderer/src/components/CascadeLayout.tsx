import { useState, type ReactElement } from 'react'
import { TerminalPane } from './TerminalPane'
import { useSessionStore } from '../state/sessionStore'

const CASCADE_OFFSET_X = 32
const CASCADE_OFFSET_Y = 28
const PANE_INSET = 32

export function CascadeLayout(): ReactElement {
  const order = useSessionStore((s) => s.order)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const [stackOrder, setStackOrder] = useState<string[]>(order)

  const display = stackOrder.filter((id) => order.includes(id))
  for (const id of order) {
    if (!display.includes(id)) display.push(id)
  }

  const bringToFront = (id: string): void => {
    setStackOrder((prev) => [...prev.filter((sid) => sid !== id), id])
    setActive(id)
  }

  return (
    <div className="relative h-full w-full overflow-hidden p-4">
      {display.map((id, i) => {
        const s = sessions[id]
        if (!s) return null
        const isTop = id === activeId
        const offset = i
        return (
          <div
            key={id}
            onMouseDown={() => bringToFront(id)}
            style={{
              left: PANE_INSET + offset * CASCADE_OFFSET_X,
              top: PANE_INSET + offset * CASCADE_OFFSET_Y,
              right: PANE_INSET,
              bottom: PANE_INSET,
              zIndex: 10 + (isTop ? display.length : i),
            }}
            className="absolute shadow-xl transition-shadow"
          >
            <TerminalPane sessionId={id} isActive={isTop} onFocus={() => bringToFront(id)} />
          </div>
        )
      })}
    </div>
  )
}
