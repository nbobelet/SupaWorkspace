import { useCallback, type ReactElement } from 'react'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useSessionStore } from '../state/sessionStore'
import type { SessionType } from '@shared/session'

export function WelcomePane(): ReactElement {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const addSession = useSessionStore((s) => s.addSession)

  const openWorkspace = useCallback(async () => {
    const res = await window.ws.workspace.open()
    if (res.workspace) {
      upsertWorkspace(res.workspace)
      setActiveWorkspace(res.workspace.id)
    }
  }, [upsertWorkspace, setActiveWorkspace])

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

  const hasWorkspaces = workspaces.length > 0
  const hasActive = !!activeWorkspaceId
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="grid h-14 w-14 place-items-center rounded-lg border border-border bg-bg-elevated text-2xl">
            <span aria-hidden="true">▣</span>
          </div>
          <h1 className="text-lg font-semibold tracking-tight">ClaudeWorkspace</h1>
          <p className="text-xs text-muted">Multi-session terminal workspace for the claude CLI.</p>
        </div>

        {!hasWorkspaces && (
          <section className="flex w-full flex-col gap-3" aria-labelledby="first-step">
            <h2 id="first-step" className="text-xs font-semibold uppercase tracking-wider text-muted">
              Step 1 — Open a folder
            </h2>
            <button
              type="button"
              onClick={() => void openWorkspace()}
              className="rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Open a workspace folder
            </button>
            <p className="text-[11px] text-muted">
              Pick any folder on disk. Sessions you spawn inside it will inherit its scope (cwd + permissions).
            </p>
          </section>
        )}

        {hasWorkspaces && !hasActive && (
          <section className="flex w-full flex-col gap-3" aria-labelledby="select-step">
            <h2 id="select-step" className="text-xs font-semibold uppercase tracking-wider text-muted">
              Select a workspace
            </h2>
            <p className="text-xs text-fg-subtle">
              Pick one in the sidebar, or open another folder.
            </p>
            <button
              type="button"
              onClick={() => void openWorkspace()}
              className="rounded-md border border-border bg-bg-elevated px-4 py-2 text-xs hover:border-border-strong"
            >
              + Open another folder
            </button>
          </section>
        )}

        {hasActive && (
          <section className="flex w-full flex-col gap-3" aria-labelledby="spawn-step">
            <h2 id="spawn-step" className="text-xs font-semibold uppercase tracking-wider text-muted">
              Spawn a session in <span className="text-fg">{activeWorkspace?.name}</span>
            </h2>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <button
                type="button"
                onClick={() => void spawn('claude')}
                className="rounded-md border border-accent bg-accent/10 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20"
              >
                + Start claude
              </button>
              <button
                type="button"
                onClick={() => void spawn('shell')}
                className="rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm hover:border-border-strong"
              >
                + Open shell
              </button>
            </div>
            <p className="text-[11px] text-muted">
              Shortcut: <kbd className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px]">Ctrl+Shift+T</kbd>{' '}
              spawns the last-used type.
            </p>
          </section>
        )}

        <footer className="mt-2 flex flex-col gap-1 text-[10px] text-muted">
          <span>
            <kbd className="rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono">Ctrl+1–9</kbd> focus session ·{' '}
            <kbd className="rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono">Ctrl+\</kbd> cycle layout
          </span>
        </footer>
      </div>
    </div>
  )
}
