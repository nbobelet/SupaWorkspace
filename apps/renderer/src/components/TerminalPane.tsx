import { useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useTerminalSession } from '../hooks/useTerminalSession'
import { useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onFocus: () => void
}

export function TerminalPane({ sessionId, isActive, onFocus }: TerminalPaneProps): ReactElement {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const session = useSessionStore((s) => s.sessions[sessionId])
  const workspace = useWorkspaceStore((s) =>
    session ? s.workspaces.find((w) => w.id === session.workspaceId) : null,
  )

  useTerminalSession(sessionId, container)

  const hue = workspace?.color?.hue
  const wrapperStyle: CSSProperties | undefined =
    hue !== undefined
      ? ({ ['--ws-hue' as string]: `${hue}deg`, borderLeftColor: 'oklch(70% 0.15 var(--ws-hue))' } as CSSProperties)
      : undefined

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onFocus}
      style={wrapperStyle}
      className={[
        'flex h-full w-full flex-col overflow-hidden rounded-md border bg-bg-elevated',
        hue !== undefined ? 'border-l-4' : '',
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
