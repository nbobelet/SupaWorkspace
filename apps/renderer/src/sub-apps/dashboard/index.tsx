import { useMemo, type ReactElement } from 'react'
import { LayoutDashboard, TriangleAlert } from 'lucide-react'
import type { SessionType } from '@shared/session'
import { useSessionStore, type RendererSession } from '../../state/sessionStore'
import { getSessionStatus, isUrgent, type SessionStatus } from '../../state/sessionStatus'
import { StatusIcon } from '../../components/StatusIcon'
import { TerminalTypeIcon } from '../../components/TerminalTypeIcon'

export interface DashboardPaneProps {
  workspaceId: string
}

interface SessionRecap {
  session: RendererSession
  status: SessionStatus
}

const TYPE_LABEL: Record<SessionType, string> = {
  claude: 'Claude',
  shell: 'Shell',
  wsl: 'WSL',
}

/**
 * Workspace landing page. Read-only recap derived purely from the session
 * Zustand store — no IPC channel of its own. Surfaces high-severity signals
 * first (errored / input-waiting sessions), then a per-type session recap.
 */
export function DashboardPane({ workspaceId }: DashboardPaneProps): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const order = useSessionStore((s) => s.order)

  const recaps = useMemo<SessionRecap[]>(() => {
    return order
      .map((id) => sessions[id])
      .filter((s): s is RendererSession => !!s && s.workspaceId === workspaceId)
      .map((session) => ({ session, status: getSessionStatus(session.state, session.exitCode) }))
  }, [sessions, order, workspaceId])

  const urgent = useMemo(() => recaps.filter((r) => isUrgent(r.status)), [recaps])

  const byType = useMemo(() => {
    const counts: Record<SessionType, number> = { claude: 0, shell: 0, wsl: 0 }
    for (const { session } of recaps) counts[session.type] += 1
    return counts
  }, [recaps])

  const typeSummary = (Object.keys(byType) as SessionType[])
    .filter((t) => byType[t] > 0)
    .map((t) => `${byType[t]} ${TYPE_LABEL[t].toLowerCase()}`)
    .join(' + ')

  return (
    <div className="supa-scroll h-full overflow-y-auto bg-bg px-6 py-5 text-fg">
      <header className="mb-5 flex items-center gap-2">
        <LayoutDashboard size={18} className="text-accent" aria-hidden="true" />
        <h1 className="text-sm font-semibold tracking-tight">Workspace dashboard</h1>
        <span className="ml-2 text-xs text-muted">
          {recaps.length} session{recaps.length === 1 ? '' : 's'}
          {typeSummary ? ` · ${typeSummary}` : ''}
        </span>
      </header>

      <section
        aria-labelledby="dash-severity"
        className="mb-5 rounded-md border border-border bg-bg-elevated/40 p-4"
      >
        <h2
          id="dash-severity"
          className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          <TriangleAlert size={13} aria-hidden="true" />
          Needs attention
        </h2>
        {urgent.length === 0 ? (
          <p className="text-xs text-muted">Nothing urgent — all sessions idle or running.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {urgent.map(({ session, status }) => (
              <li
                key={session.id}
                className={[
                  'flex items-center gap-2 rounded-sm border-l-2 px-2 py-1 text-xs',
                  status === 'error'
                    ? 'border-l-error bg-error/5 text-fg'
                    : 'border-l-warn bg-warn/5 text-fg',
                ].join(' ')}
              >
                <StatusIcon status={status} size={13} />
                <TerminalTypeIcon type={session.type} size={12} />
                <span className="min-w-0 flex-1 truncate" title={session.label}>
                  {session.label}
                </span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {status === 'error' ? 'errored' : 'input needed'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="dash-sessions"
        className="rounded-md border border-border bg-bg-elevated/40 p-4"
      >
        <h2
          id="dash-sessions"
          className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted"
        >
          Sessions
        </h2>
        {recaps.length === 0 ? (
          <p className="text-xs text-muted">No sessions yet in this workspace.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recaps.map(({ session, status }) => (
              <li key={session.id} className="flex items-center gap-2 text-xs">
                <TerminalTypeIcon type={session.type} size={12} />
                <span className="min-w-0 flex-1 truncate" title={session.label}>
                  {session.label}
                </span>
                <StatusIcon status={status} size={12} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
