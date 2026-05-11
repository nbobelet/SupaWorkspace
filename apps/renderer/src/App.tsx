import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { TerminalPane } from './components/TerminalPane'
import { useSessionStore } from './state/sessionStore'
import { useWorkspaceStore } from './state/workspaceStore'
import type { SessionType } from '@shared/session'

export function App(): ReactElement {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  const orderedSessionIds = useSessionStore((s) => s.order)
  const sessions = useSessionStore((s) => s.sessions)
  const activeSessionId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const addSession = useSessionStore((s) => s.addSession)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.ws.workspace.list().then((res) => {
      if (cancelled) return
      setWorkspaces(res.workspaces)
    })
    return () => {
      cancelled = true
    }
  }, [setWorkspaces])

  const openWorkspace = useCallback(async () => {
    setError(null)
    try {
      const res = await window.ws.workspace.open()
      if (!res.workspace) return
      upsertWorkspace(res.workspace)
      setActiveWorkspace(res.workspace.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [upsertWorkspace, setActiveWorkspace])

  const spawnSession = useCallback(
    async (type: SessionType) => {
      setError(null)
      if (!activeWorkspaceId) {
        setError('Open a workspace first')
        return
      }
      try {
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
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [activeWorkspaceId, addSession],
  )

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId) ?? null

  return (
    <div className="flex h-screen w-screen flex-col bg-bg text-fg">
      <header className="flex items-center gap-3 border-b border-border bg-bg-sunken px-4 py-2 text-sm">
        <span className="font-semibold tracking-tight">ClaudeWorkspace</span>
        <span className="text-muted">|</span>
        <span className="font-mono text-fg-subtle">
          {activeWorkspace ? activeWorkspace.name : 'no workspace'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={openWorkspace}
            className="rounded-sm border border-border bg-bg-elevated px-2.5 py-1 text-xs hover:border-border-strong hover:bg-bg"
          >
            Open workspace
          </button>
          <button
            type="button"
            onClick={() => spawnSession('shell')}
            disabled={!activeWorkspaceId}
            className="rounded-sm border border-border bg-bg-elevated px-2.5 py-1 text-xs hover:border-border-strong hover:bg-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            New shell
          </button>
          <button
            type="button"
            onClick={() => spawnSession('claude')}
            disabled={!activeWorkspaceId}
            className="rounded-sm border border-accent bg-accent/10 px-2.5 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            New claude
          </button>
        </div>
      </header>

      {error && (
        <div role="alert" className="border-b border-error/40 bg-error/10 px-4 py-1.5 text-xs text-error">
          {error}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {orderedSessionIds.length === 0 ? (
          <div className="grid flex-1 place-items-center text-muted">
            <div className="flex flex-col items-center gap-2">
              <p>No sessions yet.</p>
              <p className="text-xs">
                Open a workspace, then click <span className="text-fg-subtle">New shell</span> or{' '}
                <span className="text-accent">New claude</span>.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid flex-1 gap-2 p-2" style={{ gridTemplateColumns: `repeat(${Math.min(orderedSessionIds.length, 2)}, 1fr)` }}>
            {orderedSessionIds.map((id) => {
              const s = sessions[id]
              if (!s) return null
              return (
                <TerminalPane
                  key={id}
                  sessionId={id}
                  isActive={id === activeSessionId}
                  onFocus={() => setActive(id)}
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
