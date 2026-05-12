import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import { Settings as SettingsIcon } from 'lucide-react'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useNotificationStore } from '../state/notificationStore'
import { useWorkspaceWorstStatus } from '../state/sessionStore'
import { useInlineRename } from '../hooks/useInlineRename'
import { withViewTransition } from '../lib/viewTransition'
import { clampMenuPosition, VIEWPORT_MARGIN } from '../lib/menuPosition'
import { WorkspaceSettingsMenu } from './WorkspaceSettingsMenu'
import { StatusIcon } from './StatusIcon'
import type { Workspace } from '@shared/workspace'

interface ContextMenuState {
  workspace: Workspace
  x: number
  y: number
}

export function WorkspaceSidebar(): ReactElement {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const clearForWorkspace = useNotificationStore((s) => s.clearForWorkspace)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null)
  const setColor = useWorkspaceStore((s) => s.setColor)

  const rename = useInlineRename(async (id, newName) => {
    const updated = await window.ws.workspace.rename(id, newName)
    upsertWorkspace(updated)
  })

  // The settings popover keeps its blur-driven close. The right-click context menu
  // owns its own dismissal (Esc / outside-click / scroll / blur) inside <ContextMenu>.
  useEffect(() => {
    const close = (): void => setSettingsOpenFor(null)
    window.addEventListener('blur', close)
    return () => window.removeEventListener('blur', close)
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
      const ws = res.workspace
      withViewTransition(() => {
        upsertWorkspace(ws)
        setActiveWorkspace(ws.id)
      })
      if (res.wasExisting) {
        toast.info(`Already open as "${ws.name}"`, {
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
              withViewTransition(() => setActiveWorkspace(w.id))
              clearForWorkspace(w.id)
            }}
            onContextMenu={handleContextMenu}
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

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
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
  settingsOpen,
  onSettingsToggle,
  onStartRename,
  onChangeColor,
  onDelete,
}: WorkspaceTileProps): ReactElement {
  const worstStatus = useWorkspaceWorstStatus(w.id)

  const pillStyle = w.color
    ? { background: `oklch(70% 0.15 ${w.color.hue}deg)` }
    : undefined

  return (
    <li className="group/tile relative">
      <div
        data-priority={worstStatus}
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
        <span
          className="mt-0.5 flex shrink-0 items-center"
          title={`workspace status: ${worstStatus}`}
        >
          <StatusIcon status={worstStatus} size={14} />
        </span>
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
    </li>
  )
}

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>
}

function ContextMenu({ x, y, onClose, items }: ContextMenuProps): ReactElement {
  const ref = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition(
      clampMenuPosition({
        x,
        y,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: VIEWPORT_MARGIN,
      }),
    )
  }, [x, y])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const el = ref.current
      if (!el) return
      if (event.target instanceof Node && el.contains(event.target)) return
      onClose()
    }
    const onScroll = (): void => onClose()
    const onBlur = (): void => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  return (
    <ul
      ref={ref}
      role="menu"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-[160px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg"
    >
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              item.onClick()
              onClose()
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
