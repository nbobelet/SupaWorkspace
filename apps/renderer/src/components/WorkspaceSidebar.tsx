import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useWorkspaceStore } from '../state/workspaceStore'
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

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  useEffect(() => {
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
    }
  }, [])

  const openWorkspace = useCallback(async () => {
    const res = await window.ws.workspace.open()
    if (res.workspace) {
      upsertWorkspace(res.workspace)
      setActiveWorkspace(res.workspace.id)
    }
  }, [upsertWorkspace, setActiveWorkspace])

  const handleContextMenu = useCallback((e: React.MouseEvent, workspace: Workspace) => {
    e.preventDefault()
    setMenu({ workspace, x: e.clientX, y: e.clientY })
  }, [])

  const startRename = useCallback((workspace: Workspace) => {
    setRenaming(workspace.id)
    setRenameValue(workspace.name)
    setMenu(null)
  }, [])

  const commitRename = useCallback(
    async (id: string) => {
      const trimmed = renameValue.trim()
      setRenaming(null)
      if (!trimmed) return
      const updated = await window.ws.workspace.rename(id, trimmed)
      upsertWorkspace(updated)
    },
    [renameValue, upsertWorkspace],
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
          <li className="px-3 py-2 text-xs text-muted">No workspaces yet. Click "Open".</li>
        )}
        {workspaces.map((w) => {
          const isActive = w.id === activeWorkspaceId
          const isRenaming = renaming === w.id
          return (
            <li key={w.id}>
              <button
                type="button"
                onClick={() => !isRenaming && setActiveWorkspace(w.id)}
                onContextMenu={(e) => handleContextMenu(e, w)}
                className={[
                  'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
                  isActive ? 'bg-bg-elevated text-fg' : 'text-fg-subtle hover:bg-bg-elevated/60',
                ].join(' ')}
              >
                <span className="mt-0.5 text-xs text-muted">●</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => void commitRename(w.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void commitRename(w.id)
                        if (e.key === 'Escape') setRenaming(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="bg-bg px-1 py-0.5 text-sm outline-none ring-1 ring-accent"
                    />
                  ) : (
                    <span className="truncate font-medium">{w.name}</span>
                  )}
                  <span className="truncate text-[11px] text-muted" title={w.rootPath}>
                    {w.rootPath}
                  </span>
                </span>
              </button>
            </li>
          )
        })}
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
            { label: 'Rename', onClick: () => startRename(menu.workspace) },
            { label: 'Reveal in explorer', onClick: () => void reveal(menu.workspace.id) },
            { label: 'Remove from list', onClick: () => void remove(menu.workspace.id), danger: true },
          ]}
        />
      )}
    </aside>
  )
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
