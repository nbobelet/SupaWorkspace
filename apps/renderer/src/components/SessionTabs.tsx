import { useCallback, useEffect, type ReactElement } from 'react'
import { Terminal, Sparkles } from 'lucide-react'
import { useScopedOrder, useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useInlineRename } from '../hooks/useInlineRename'
import type { SessionType } from '@shared/session'

function truncateMiddle(text: string, maxLen = 40): string {
  if (text.length <= maxLen) return text
  const half = Math.floor((maxLen - 1) / 2)
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`
}

export function SessionTabs(): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const addSession = useSessionStore((s) => s.addSession)
  const renameSession = useSessionStore((s) => s.renameSession)
  const lastUsedType = useSessionStore((s) => s.lastUsedType)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
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

      <div className="ml-3 flex shrink-0 items-center gap-1.5 border-l border-border pl-3">
        <button
          type="button"
          onClick={() => void spawn('shell')}
          disabled={!activeWorkspaceId}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2.5 text-xs font-medium hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          title="New shell (Ctrl+T spawns last-used)"
          aria-label="New shell session"
        >
          <Terminal size={14} aria-hidden="true" />
          <span>Shell</span>
        </button>
        <button
          type="button"
          onClick={() => void spawn('claude')}
          disabled={!activeWorkspaceId}
          className="flex h-7 items-center gap-1.5 rounded-md border border-accent bg-accent/10 px-2.5 text-xs font-medium text-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="New Claude session"
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Claude</span>
        </button>
      </div>

      {activeWorkspace && (
        <span
          className="ml-auto max-w-[40%] truncate font-mono text-[10px] text-muted"
          title={activeWorkspace.rootPath}
        >
          {truncateMiddle(activeWorkspace.rootPath)}
        </span>
      )}
      <span className="ml-2 shrink-0 text-[10px] text-muted">last-used: {lastUsedType}</span>
    </div>
  )
}
