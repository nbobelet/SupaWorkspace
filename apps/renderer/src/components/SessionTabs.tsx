import { useCallback, useEffect, type ReactElement } from 'react'
import { useScopedOrder, useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useInlineRename } from '../hooks/useInlineRename'
import type { SessionType } from '@shared/session'

export function SessionTabs(): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const addSession = useSessionStore((s) => s.addSession)
  const renameSession = useSessionStore((s) => s.renameSession)
  const lastUsedType = useSessionStore((s) => s.lastUsedType)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const scopedOrder = useScopedOrder()

  const rename = useInlineRename(async (id, newLabel) => {
    const existing = sessions[id]
    if (!existing || existing.label === newLabel) return
    try {
      const res = await window.ws.session.rename({ sessionId: id, label: newLabel })
      renameSession(id, res.label)
    } catch (err) {
      console.error('[session] rename failed', err)
    }
  })

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ sessionId: string }>).detail
      if (!detail?.sessionId) return
      const target = sessions[detail.sessionId]
      if (!target) return
      rename.startRename(detail.sessionId, target.label)
    }
    window.addEventListener('session:rename-request', handler)
    return () => window.removeEventListener('session:rename-request', handler)
  }, [sessions, rename])

  const startRename = useCallback(
    (id: string) => {
      const target = sessions[id]
      if (!target) return
      rename.startRename(id, target.label)
    },
    [sessions, rename],
  )

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
      {scopedOrder.map((id) => {
        const s = sessions[id]
        if (!s) return null
        const isActive = id === activeId
        const isRenaming = rename.isRenaming(id)
        const showBadge = s.hasUnseenWaiting && !isActive
        return (
          <div
            key={id}
            className={[
              'group flex items-center gap-2 rounded-sm border px-2 py-1 transition-colors',
              isActive
                ? 'border-accent bg-bg-elevated text-fg'
                : 'border-border bg-bg-elevated/40 text-fg-subtle hover:border-border-strong hover:text-fg',
            ].join(' ')}
            aria-current={isActive ? 'true' : undefined}
          >
            <button
              type="button"
              onClick={() => !isRenaming && setActive(id)}
              onDoubleClick={() => startRename(id)}
              className="flex items-center gap-2"
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
              {isRenaming ? (
                <input
                  autoFocus
                  value={rename.renameValue}
                  onChange={(e) => rename.setRenameValue(e.target.value)}
                  onBlur={() => void rename.commitRename(id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void rename.commitRename(id)
                    if (e.key === 'Escape') rename.cancelRename()
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-32 bg-bg px-1 py-0 font-mono text-xs outline-none ring-1 ring-accent"
                  aria-label="Rename session"
                />
              ) : (
                <span className="font-mono">{s.label}</span>
              )}
              {showBadge && (
                <span
                  aria-live="polite"
                  className="h-1.5 w-1.5 rounded-full bg-warn motion-safe:animate-pulse"
                  title="Waiting for input"
                />
              )}
            </button>
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
          </div>
        )
      })}

      <div className="ml-2 flex items-center gap-1">
        <button
          type="button"
          onClick={() => void spawn('shell')}
          disabled={!activeWorkspaceId}
          className="rounded-sm border border-border bg-bg-elevated px-2 py-1 hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
          title="New shell (Ctrl+T spawns last-used)"
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
