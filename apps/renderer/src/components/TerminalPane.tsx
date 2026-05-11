import { useRef, useState, type ReactElement } from 'react'
import { useTerminalSession } from '../hooks/useTerminalSession'
import { useSessionStore } from '../state/sessionStore'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onFocus: () => void
}

export function TerminalPane({ sessionId, isActive, onFocus }: TerminalPaneProps): ReactElement {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const session = useSessionStore((s) => s.sessions[sessionId])

  useTerminalSession(sessionId, container)

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onFocus}
      className={[
        'flex h-full w-full flex-col overflow-hidden rounded-md border bg-bg-elevated',
        isActive ? 'border-accent ring-1 ring-accent/40' : 'border-border',
      ].join(' ')}
    >
      <header className="flex items-center justify-between border-b border-border bg-bg-sunken px-3 py-1.5 text-xs">
        <span className="font-mono text-fg-subtle">
          {session?.label ?? sessionId.slice(0, 8)}
        </span>
        <span
          aria-live="polite"
          className={[
            'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider',
            session?.state === 'running' ? 'bg-running/20 text-running' : '',
            session?.state === 'waiting-for-input' ? 'bg-warn/20 text-warn animate-pulse' : '',
            session?.state === 'finished' ? 'bg-accent-dim/40 text-accent' : '',
            session?.state === 'error' ? 'bg-error/20 text-error' : '',
            session?.state === 'idle' || !session ? 'bg-border/40 text-muted' : '',
          ].join(' ')}
        >
          {session?.state ?? 'idle'}
        </span>
      </header>
      <div ref={setContainer} className="flex-1 overflow-hidden" />
    </div>
  )
}
