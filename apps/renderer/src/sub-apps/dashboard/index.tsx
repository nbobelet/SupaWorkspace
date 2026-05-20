import { useEffect, useMemo, type ReactElement } from 'react'
import { LayoutDashboard, ListTodo, TriangleAlert } from 'lucide-react'
import type { SessionType } from '@shared/session'
import { ARCHIVE_COLUMN_ID } from '@shared/todo'
import { useSessionStore, type RendererSession } from '../../state/sessionStore'
import { getSessionStatus, isUrgent, type SessionStatus } from '../../state/sessionStatus'
import { StatusIcon } from '../../components/StatusIcon'
import { TerminalTypeIcon } from '../../components/TerminalTypeIcon'
import { useTodoStore } from '../todo/store'

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
}

/**
 * Workspace landing page. Read-only recap derived purely from the session and
 * todo Zustand stores — no IPC channel of its own. Surfaces high-severity
 * signals first (errored / input-waiting sessions, high-severity open tasks),
 * then a per-type session recap, then the open-TODO count.
 */
export function DashboardPane({ workspaceId }: DashboardPaneProps): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const order = useSessionStore((s) => s.order)

  const todoLoaded = useTodoStore((s) => s.loadedFor[workspaceId] === true)
  const todoState = useTodoStore((s) => s.byWorkspace[workspaceId])
  const loadTodo = useTodoStore((s) => s.load)

  useEffect(() => {
    void loadTodo(workspaceId)
  }, [loadTodo, workspaceId])

  const recaps = useMemo<SessionRecap[]>(() => {
    return order
      .map((id) => sessions[id])
      .filter((s): s is RendererSession => !!s && s.workspaceId === workspaceId)
      .map((session) => ({ session, status: getSessionStatus(session.state, session.exitCode) }))
  }, [sessions, order, workspaceId])

  const urgent = useMemo(() => recaps.filter((r) => isUrgent(r.status)), [recaps])

  const byType = useMemo(() => {
    const counts: Record<SessionType, number> = { claude: 0, shell: 0 }
    for (const { session } of recaps) counts[session.type] += 1
    return counts
  }, [recaps])

  const openTasks = useMemo(
    () => (todoState ? todoState.tasks.filter((t) => t.columnId !== ARCHIVE_COLUMN_ID) : []),
    [todoState],
  )
  const highSeverityTasks = useMemo(
    () => openTasks.filter((t) => t.severity === 'high'),
    [openTasks],
  )

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
        {urgent.length === 0 && highSeverityTasks.length === 0 ? (
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
            {highSeverityTasks.length > 0 && (
              <li className="flex items-center gap-2 rounded-sm border-l-2 border-l-error bg-error/5 px-2 py-1 text-xs">
                <ListTodo size={13} className="text-error" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">
                  {highSeverityTasks.length} high-severity task
                  {highSeverityTasks.length === 1 ? '' : 's'} open
                </span>
              </li>
            )}
          </ul>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
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

        <section
          aria-labelledby="dash-todo"
          className="rounded-md border border-border bg-bg-elevated/40 p-4"
        >
          <h2
            id="dash-todo"
            className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted"
          >
            <ListTodo size={13} aria-hidden="true" />
            TODO
          </h2>
          {!todoLoaded && !todoState ? (
            <div className="h-4 w-24 animate-pulse rounded-sm bg-fg/10" aria-hidden="true" />
          ) : (
            <p className="text-xs text-muted">
              <span className="text-2xl font-semibold text-fg">{openTasks.length}</span> open task
              {openTasks.length === 1 ? '' : 's'}
              {highSeverityTasks.length > 0 ? ` · ${highSeverityTasks.length} high` : ''}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}
