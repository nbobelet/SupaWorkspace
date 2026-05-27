import { useCallback, type ReactElement } from 'react'
import { Terminal, TerminalSquare, Sparkles, FolderPlus } from 'lucide-react'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useOpenWorkspace } from '../hooks/useOpenWorkspace'
import { useCapabilities } from '../hooks/useCapabilities'
import { addSessionWithFocus, activateSession } from '../lib/sessionFocus'
import type { SessionType } from '@shared/session'
import { useSessionStore, type RendererSession } from '../state/sessionStore'

interface EmptyWorkspaceStateProps {
  pendingSessions?: RendererSession[]
}

export function EmptyWorkspaceState({ pendingSessions }: EmptyWorkspaceStateProps): ReactElement {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const openWorkspace = useOpenWorkspace()
  const { wsl: wslAvailable } = useCapabilities()

  const spawn = useCallback(
    async (type: SessionType) => {
      if (!activeWorkspaceId) return
      // Picking "New Shell" / "New Claude" via the snapshot offer is the
      // user's explicit "I don't want to restore" answer — drop the
      // placeholders so they don't linger as ghost tabs in the sidebar.
      useSessionStore.getState().removePendingForWorkspace(activeWorkspaceId)
      const res = await window.ws.session.spawn({
        workspaceId: activeWorkspaceId,
        type,
        cols: 80,
        rows: 24,
      })
      addSessionWithFocus({
        id: res.sessionId,
        workspaceId: activeWorkspaceId,
        type,
        label: res.label,
        state: 'idle',
      })
    },
    [activeWorkspaceId],
  )

  const hasPending = pendingSessions && pendingSessions.length > 0

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <h1 className="text-base font-semibold tracking-tight">
          {hasPending ? 'No active session' : 'No session yet'}
        </h1>
        <p className="text-xs text-muted">
          {activeWorkspace
            ? `Spawn a terminal or Claude session in "${activeWorkspace.name}".`
            : 'Spawn a terminal or Claude session.'}
        </p>

        {hasPending && (
          <section
            className="flex w-full flex-col gap-1.5 rounded-md border border-border bg-bg-elevated p-3"
            aria-labelledby="restore-heading"
          >
            <h2
              id="restore-heading"
              className="mb-0.5 text-left text-[10px] font-semibold uppercase tracking-wider text-muted"
            >
              Restore from previous session
            </h2>
            {pendingSessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => void activateSession(s.id)}
                className="flex w-full items-center gap-2 rounded border border-border bg-bg px-3 py-1.5 text-left text-xs text-fg hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {s.type === 'claude' ? (
                  <Sparkles size={12} aria-hidden="true" className="shrink-0 text-accent" />
                ) : (
                  <Terminal size={12} aria-hidden="true" className="shrink-0 text-muted" />
                )}
                <span className="flex-1 truncate">{s.label}</span>
                <span className="font-mono text-[10px] uppercase text-muted">{s.type}</span>
              </button>
            ))}
          </section>
        )}

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => void spawn('shell')}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Terminal size={16} aria-hidden="true" />
            <span>New Shell</span>
          </button>
          <button
            type="button"
            onClick={() => void spawn('claude')}
            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <Sparkles size={16} aria-hidden="true" />
            <span>New Claude</span>
          </button>
          {wslAvailable && (
            <button
              type="button"
              onClick={() => void spawn('wsl')}
              className="flex flex-1 items-center justify-center gap-2 rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <TerminalSquare size={16} aria-hidden="true" />
              <span>WSL: Ubuntu</span>
            </button>
          )}
        </div>
        <p className="text-[10px] text-muted">
          <kbd className="rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono">
            Ctrl+T
          </kbd>{' '}
          spawns the last-used type.
        </p>
        <div className="mt-2 flex w-full flex-col items-center gap-1 border-t border-border pt-4">
          <button
            type="button"
            onClick={() => void openWorkspace()}
            aria-label="Start a clean workspace by opening another folder"
            className="flex items-center gap-2 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-xs hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <FolderPlus size={14} aria-hidden="true" />
            <span>Start clean workspace</span>
          </button>
          <p className="text-[10px] text-muted">Fresh workspace, keeps your existing ones.</p>
        </div>
      </div>
    </div>
  )
}
