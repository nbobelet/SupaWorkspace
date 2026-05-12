import { useCallback, type ReactElement } from 'react'
import { Terminal, Sparkles, FolderPlus } from 'lucide-react'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useOpenWorkspace } from '../hooks/useOpenWorkspace'
import { addSessionWithFocus } from '../lib/sessionFocus'
import type { SessionType } from '@shared/session'

export function EmptyWorkspaceState(): ReactElement {
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const openWorkspace = useOpenWorkspace()

  const spawn = useCallback(
    async (type: SessionType) => {
      if (!activeWorkspaceId) return
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

  return (
    <div className="grid h-full place-items-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-5 text-center">
        <h1 className="text-base font-semibold tracking-tight">No session yet</h1>
        <p className="text-xs text-muted">
          {activeWorkspace
            ? `Spawn a terminal or Claude session in "${activeWorkspace.name}".`
            : 'Spawn a terminal or Claude session.'}
        </p>
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
        </div>
        <p className="text-[10px] text-muted">
          <kbd className="rounded border border-border bg-bg-elevated px-1 py-0.5 font-mono">Ctrl+T</kbd>{' '}
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
