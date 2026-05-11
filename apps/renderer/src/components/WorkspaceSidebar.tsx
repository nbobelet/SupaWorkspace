import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Settings as SettingsIcon } from 'lucide-react'
import { useWorkspaceStore } from '../state/workspaceStore'
import {
  recentByWorkspace,
  unreadCountByWorkspace,
  useNotificationStore,
  type RendererNotification,
} from '../state/notificationStore'
import { useSessionStore } from '../state/sessionStore'
import { useInlineRename } from '../hooks/useInlineRename'
import { WorkspaceSettingsMenu } from './WorkspaceSettingsMenu'
import type { Workspace } from '@shared/workspace'

interface ContextMenuState {
  workspace: Workspace
  x: number
  y: number
}

interface WorkspaceSidebarProps {
  onSettingsToggle: () => void
  settingsOpen: boolean
}

export function WorkspaceSidebar({ onSettingsToggle, settingsOpen }: WorkspaceSidebarProps): ReactElement {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const markAllReadForWorkspace = useNotificationStore((s) => s.markAllReadForWorkspace)
  const clearForWorkspace = useNotificationStore((s) => s.clearForWorkspace)
  const setActiveSession = useSessionStore((s) => s.setActive)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [bellOpen, setBellOpen] = useState<string | null>(null)
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null)
  const setColor = useWorkspaceStore((s) => s.setColor)

  const rename = useInlineRename(async (id, newName) => {
    const updated = await window.ws.workspace.rename(id, newName)
    upsertWorkspace(updated)
  })

  useEffect(() => {
    const close = (): void => {
      setMenu(null)
      setBellOpen(null)
      setSettingsOpenFor(null)
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  useEffect(() => {
    const handler = (): void => {
      if (!activeWorkspaceId) return
      const target = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!target) return
      rename.startRename(target.id, target.name)
    }
    window.addEventListener('workspace:rename-active', handler)
    return () => window.removeEventListener('workspace:rename-active', handler)
  }, [activeWorkspaceId, workspaces, rename])

  const openWorkspace = useCallback(async () => {
    const res = await window.ws.workspace.open()
    if (res.workspace) {
      upsertWorkspace(res.workspace)
      setActiveWorkspace(res.workspace.id)
      if (res.wasExisting) {
        toast.info(`Already open as "${res.workspace.name}"`, {
          description: 'Switched to the existing workspace.',
        })
      }
    }
  }, [upsertWorkspace, setActiveWorkspace])

  const handleContextMenu = useCallback((e: React.MouseEvent, workspace: Workspace) => {
    e.preventDefault()
    setMenu({ workspace, x: e.clientX, y: e.clientY })
  }, [])

  const startRenameFromMenu = useCallback(
    (workspace: Workspace) => {
      rename.startRename(workspace.id, workspace.name)
      setMenu(null)
    },
    [rename],
  )

  const remove = useCallback(
    async (id: string) => {
      await window.ws.workspace.remove(id)
      removeWorkspace(id)
      const next = await window.ws.workspace.list()
      setWorkspaces(next.workspaces)
      setMenu(null)
    },
    [removeWorkspace, setWorkspaces],
  )

  const reveal = useCallback(async (id: string) => {
    await window.ws.workspace.reveal(id)
    setMenu(null)
  }, [])

  const openNotif = useCallback(
    (notif: RendererNotification) => {
      markRead(notif.id)
      setActiveWorkspace(notif.workspaceId)
      if (notif.sessionId) setActiveSession(notif.sessionId)
      setBellOpen(null)
    },
    [markRead, setActiveWorkspace, setActiveSession],
  )

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-bg-sunken">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Workspaces</span>
        <button
          type="button"
          onClick={openWorkspace}
          title="Open workspace"
          className="rounded-sm border border-border bg-bg-elevated px-2 py-0.5 text-xs hover:border-border-strong"
        >
          + Open
        </button>
      </div>

      <ul className="flex-1 overflow-y-auto py-1">
        {workspaces.length === 0 && (
          <li className="px-3 py-2 text-xs text-muted">No workspaces yet. Click &ldquo;Open&rdquo;.</li>
        )}
        {workspaces.map((w) => (
          <WorkspaceTile
            key={w.id}
            workspace={w}
            isActive={w.id === activeWorkspaceId}
            isRenaming={rename.isRenaming(w.id)}
            renameValue={rename.renameValue}
            onRenameChange={rename.setRenameValue}
            onRenameCommit={rename.commitRename}
            onRenameCancel={rename.cancelRename}
            onActivate={() => {
              setActiveWorkspace(w.id)
              clearForWorkspace(w.id)
            }}
            onContextMenu={handleContextMenu}
            notifications={notifications}
            bellOpen={bellOpen === w.id}
            onBellToggle={() => setBellOpen((prev) => (prev === w.id ? null : w.id))}
            onMarkAllRead={() => markAllReadForWorkspace(w.id)}
            onOpenNotif={openNotif}
            settingsOpen={settingsOpenFor === w.id}
            onSettingsToggle={() =>
              setSettingsOpenFor((prev) => (prev === w.id ? null : w.id))
            }
            onStartRename={() => rename.startRename(w.id, w.name)}
            onChangeColor={(hue) => void setColor(w.id, hue)}
            onDelete={() => void remove(w.id)}
          />
        ))}
      </ul>

      <div className="border-t border-border px-3 py-2">
        <button
          type="button"
          onClick={onSettingsToggle}
          aria-pressed={settingsOpen}
          className={[
            'w-full rounded-sm border px-2 py-1 text-xs',
            settingsOpen
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-bg-elevated text-fg-subtle hover:border-border-strong',
          ].join(' ')}
        >
          {settingsOpen ? 'Hide settings' : 'Show settings'}
        </button>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={[
            { label: 'Rename', onClick: () => startRenameFromMenu(menu.workspace) },
            { label: 'Reveal in explorer', onClick: () => void reveal(menu.workspace.id) },
            { label: 'Remove from list', onClick: () => void remove(menu.workspace.id), danger: true },
          ]}
        />
      )}
    </aside>
  )
}

interface WorkspaceTileProps {
  workspace: Workspace
  isActive: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameCommit: (id: string) => void | Promise<void>
  onRenameCancel: () => void
  onActivate: () => void
  onContextMenu: (e: React.MouseEvent, w: Workspace) => void
  notifications: RendererNotification[]
  bellOpen: boolean
  onBellToggle: () => void
  onMarkAllRead: () => void
  onOpenNotif: (notif: RendererNotification) => void
  settingsOpen: boolean
  onSettingsToggle: () => void
  onStartRename: () => void
  onChangeColor: (hue: number) => void
  onDelete: () => void
}

function WorkspaceTile({
  workspace: w,
  isActive,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onActivate,
  onContextMenu,
  notifications,
  bellOpen,
  onBellToggle,
  onMarkAllRead,
  onOpenNotif,
  settingsOpen,
  onSettingsToggle,
  onStartRename,
  onChangeColor,
  onDelete,
}: WorkspaceTileProps): ReactElement {
  const unread = useMemo(() => unreadCountByWorkspace(notifications, w.id), [notifications, w.id])
  const recent = useMemo(() => recentByWorkspace(notifications, w.id, 10), [notifications, w.id])

  const pillStyle = w.color
    ? { background: `oklch(70% 0.15 ${w.color.hue}deg)` }
    : undefined

  return (
    <li className="group/tile relative">
      <div
        className={[
          'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
          isActive ? 'bg-bg-elevated text-fg' : 'text-fg-subtle hover:bg-bg-elevated/60',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={() => !isRenaming && onActivate()}
          onContextMenu={(e) => onContextMenu(e, w)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {w.color ? (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={pillStyle}
              aria-hidden="true"
            />
          ) : (
            <span className="mt-0.5 text-xs text-muted">●</span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={() => void onRenameCommit(w.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onRenameCommit(w.id)
                  if (e.key === 'Escape') onRenameCancel()
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-bg px-1 py-0.5 text-sm outline-none ring-1 ring-accent"
                aria-label="Rename workspace"
              />
            ) : (
              <span className="truncate font-medium">{w.name}</span>
            )}
            <span className="truncate text-[11px] text-muted" title={w.rootPath}>
              {w.rootPath}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onBellToggle()
          }}
          aria-label={`${unread} unread notification${unread === 1 ? '' : 's'} for ${w.name}`}
          aria-expanded={bellOpen}
          className={[
            'relative shrink-0 rounded-sm px-1 py-0.5 text-xs',
            unread > 0 ? 'text-fg' : 'text-muted hover:text-fg',
          ].join(' ')}
          title="Notifications"
        >
          <span aria-hidden="true">🔔</span>
          {unread > 0 && (
            <span
              className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-warn px-0.5 text-[9px] font-bold text-bg motion-safe:animate-pulse"
              aria-hidden="true"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSettingsToggle()
          }}
          aria-label={`Workspace settings for ${w.name}`}
          aria-expanded={settingsOpen}
          className={[
            'shrink-0 rounded-sm px-1 py-0.5 text-muted hover:text-fg',
            settingsOpen ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100',
          ].join(' ')}
          title="Workspace settings"
        >
          <SettingsIcon size={14} aria-hidden="true" />
        </button>
      </div>

      {settingsOpen && (
        <WorkspaceSettingsMenu
          workspace={w}
          onRename={onStartRename}
          onChangeColor={onChangeColor}
          onDelete={onDelete}
          onClose={onSettingsToggle}
        />
      )}

      {bellOpen && (
        <div
          role="dialog"
          aria-label={`Notifications for ${w.name}`}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-2 top-12 z-40 w-56 rounded-md border border-border bg-bg-elevated shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-2 py-1.5 text-[10px] uppercase tracking-wider text-muted">
            <span>{w.name}</span>
            {recent.length > 0 && (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-fg-subtle hover:text-fg"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {recent.length === 0 && (
              <li className="px-2 py-2 text-xs text-muted">No notifications.</li>
            )}
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onOpenNotif(n)}
                  className={[
                    'flex w-full items-start gap-2 px-2 py-1.5 text-left text-xs',
                    n.read ? 'text-fg-subtle' : 'text-fg',
                    'hover:bg-bg-sunken',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                      n.kind === 'user-input-required' ? 'bg-warn' : '',
                      n.kind === 'permission-prompt' ? 'bg-warn' : '',
                      n.kind === 'request-complete' ? 'bg-accent' : '',
                      n.kind === 'error' ? 'bg-error' : '',
                    ].join(' ')}
                    aria-hidden="true"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-mono">{n.sessionLabel}</span>
                    <span className="text-[10px] text-muted">{notifLabel(n.kind)} · {formatTs(n.ts)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function notifLabel(kind: RendererNotification['kind']): string {
  switch (kind) {
    case 'user-input-required':
      return 'waiting for input'
    case 'permission-prompt':
      return 'permission requested'
    case 'request-complete':
      return 'finished'
    case 'error':
      return 'errored'
  }
}

function formatTs(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  return new Date(ts).toLocaleDateString()
}

interface ContextMenuProps {
  x: number
  y: number
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>
}

function ContextMenu({ x, y, items }: ContextMenuProps): ReactElement {
  return (
    <ul
      role="menu"
      style={{ left: x, top: y }}
      className="fixed z-50 min-w-[160px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg"
    >
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation()
              item.onClick()
            }}
            className={[
              'block w-full px-3 py-1.5 text-left text-xs',
              item.danger ? 'text-error hover:bg-error/10' : 'text-fg hover:bg-bg',
            ].join(' ')}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
