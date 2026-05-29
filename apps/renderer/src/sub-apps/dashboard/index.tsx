import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { LayoutDashboard, TriangleAlert } from 'lucide-react'
import type { SessionType } from '@shared/session'
import { isHomeWorkspace } from '@shared/workspace'
import { useSessionStore, type RendererSession } from '../../state/sessionStore'
import { useWorkspaceStore } from '../../state/workspaceStore'
import { getSessionStatus, isUrgent, type SessionStatus } from '../../state/sessionStatus'
import { jumpToSession } from '../../lib/sessionFocus'
import { StatusIcon } from '../../components/StatusIcon'
import { TerminalTypeIcon } from '../../components/TerminalTypeIcon'
import {
  buildGlobalSessionIndex,
  countWorkspacesWithSessions,
  type GlobalSessionRow,
} from './globalSessionIndex'

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

function dotStyle(hue: number | null): { background: string } | undefined {
  return hue === null ? undefined : { background: `oklch(70% 0.15 ${hue}deg)` }
}

/**
 * Home landing surface: a navigable list of every open session across all
 * workspaces, each identified by its workspace ("SupaNotes : TTY#1"). The list
 * is a keyboard-driven listbox — ArrowUp/Down moves the roving selection, Enter
 * (or a click) jumps to that session via the shared cross-workspace navigator.
 */
function GlobalSessionOverview({ rows }: { rows: GlobalSessionRow[] }): ReactElement {
  const [selected, setSelected] = useState(0)
  const rowRefs = useRef<(HTMLLIElement | null)[]>([])
  const count = rows.length
  const sel = count === 0 ? 0 : Math.min(selected, count - 1)
  const wsCount = useMemo(() => countWorkspacesWithSessions(rows), [rows])

  const move = useCallback(
    (delta: number) => {
      if (count === 0) return
      setSelected((cur) => {
        const next = (Math.min(cur, count - 1) + delta + count) % count
        rowRefs.current[next]?.focus()
        return next
      })
    },
    [count],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        move(1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        move(-1)
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        const row = rows[sel]
        if (row) void jumpToSession(row.sessionId)
      }
    },
    [move, rows, sel],
  )

  return (
    <div className="supa-scroll h-full overflow-y-auto bg-bg px-6 py-5 text-fg">
      <header className="mb-5 flex items-center gap-2">
        <LayoutDashboard size={18} className="text-accent" aria-hidden="true" />
        <h1 className="text-sm font-semibold tracking-tight">Open sessions</h1>
        <span className="ml-2 text-xs text-muted">
          {count} open across {wsCount} workspace{wsCount === 1 ? '' : 's'}
        </span>
      </header>

      {count === 0 ? (
        <p className="rounded-md border border-border bg-bg-elevated/40 p-4 text-xs text-muted">
          No open sessions yet — spawn a terminal or Claude session in any workspace.
        </p>
      ) : (
        <ul
          role="listbox"
          aria-label="Open sessions across all workspaces"
          className="flex flex-col gap-1 rounded-md border border-border bg-bg-elevated/40 p-2"
          onKeyDown={onKeyDown}
        >
          {rows.map((row, i) => (
            <li
              key={row.sessionId}
              ref={(el) => {
                rowRefs.current[i] = el
              }}
              role="option"
              aria-selected={i === sel}
              tabIndex={i === sel ? 0 : -1}
              onClick={() => void jumpToSession(row.sessionId)}
              onFocus={() => setSelected(i)}
              className={[
                'flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-xs outline-none',
                i === sel ? 'bg-accent/10 text-fg' : 'text-fg hover:bg-bg-elevated',
              ].join(' ')}
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-muted"
                style={dotStyle(row.hue)}
                aria-hidden="true"
              />
              <TerminalTypeIcon type={row.type} size={12} />
              <span className="min-w-0 flex-1 truncate" title={row.label}>
                {row.label}
              </span>
              <StatusIcon status={row.status} size={12} />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Workspace landing page. Read-only recap derived purely from the session
 * Zustand store — no IPC channel of its own. On the Home workspace it widens to
 * a global, navigable overview of every open session; on a folder workspace it
 * surfaces high-severity signals first, then a per-type session recap.
 */
export function DashboardPane({ workspaceId }: DashboardPaneProps): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const order = useSessionStore((s) => s.order)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  const activeWorkspace = workspaces.find((w) => w.id === workspaceId)
  const isHome = !!activeWorkspace && isHomeWorkspace(activeWorkspace)

  const globalRows = useMemo(
    () => buildGlobalSessionIndex(sessions, order, workspaces),
    [sessions, order, workspaces],
  )

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

  if (isHome) return <GlobalSessionOverview rows={globalRows} />

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
