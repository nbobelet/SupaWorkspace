import { useCallback, type ReactElement } from 'react'
import { useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import type { SessionType } from '@shared/session'

export function SessionTabs(): ReactElement {
  const order = useSessionStore((s) => s.order)
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const addSession = useSessionStore((s) => s.addSession)
  const lastUsedType = useSessionStore((s) => s.lastUsedType)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const spawn = useCallback(
    async (type: SessionType) => {
      if (!activeWorkspaceId) return
      const res = await window.ws.session.spawn({
        workspaceId: activeWorkspaceId,
        type,
        cols: 80,
        rows: 24,
      })
      addSession({
        id: res.sessionId,
        workspaceId: activeWorkspaceId,
        type,
        label: res.label,
        state: 'idle',
        hasUnseenWaiting: false,
      })
    },
    [activeWorkspaceId, addSession],
  )

  return (
    <div className="flex items-center gap-1 border-b border-border bg-bg-sunken px-2 py-1 text-xs">
      {order.map((id) => {
        const s = sessions[id]
        if (!s) return null
        const isActive = id === activeId
        const showBadge = s.hasUnseenWaiting && !isActive
        return (
          <button
            key={id}
            type="button"
            onClick={() => setActive(id)}
            className={[
              'group flex items-center gap-2 rounded-sm border px-2 py-1 transition-colors',
              isActive
                ? 'border-accent bg-bg-elevated text-fg'
                : 'border-border bg-bg-elevated/40 text-fg-subtle hover:border-border-strong hover:text-fg',
            ].join(' ')}
            aria-current={isActive ? 'true' : undefined}
            aria-label={`${s.label} session, state ${s.state}${showBadge ? ', waiting for input' : ''}`}
          >
            <span
              className={[
                'h-1.5 w-1.5 rounded-full',
                s.state === 'running' ? 'bg-running' : '',
                s.state === 'waiting-for-input' ? 'bg-warn motion-safe:animate-pulse' : '',
                s.state === 'finished' ? 'bg-accent' : '',
                s.state === 'error' ? 'bg-error' : '',
                s.state === 'idle' ? 'bg-muted' : '',
              ].join(' ')}
            />
            <span className="font-mono">{s.label}</span>
            {showBadge && (
              <span
                aria-live="polite"
                className="h-1.5 w-1.5 rounded-full bg-warn motion-safe:animate-pulse"
                title="Waiting for input"
              />
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                void window.ws.session.kill({ sessionId: id })
              }}
              className="ml-1 text-muted hover:text-fg"
              aria-label="Close session"
            >
              ×
            </button>
          </button>
        )
      })}

      <div className="ml-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => void spawn('shell')}
          disabled={!activeWorkspaceId}
          className="rounded-sm border border-border bg-bg-elevated px-2 py-1 hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
          title="New shell (Ctrl+Shift+T spawns last-used)"
        >
          + shell
        </button>
        <button
          type="button"
          onClick={() => void spawn('claude')}
          disabled={!activeWorkspaceId}
          className="rounded-sm border border-accent bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + claude
        </button>
      </div>

      <span className="ml-auto text-[10px] text-muted">last-used: {lastUsedType}</span>
    </div>
  )
}
