import { useCallback, useState, type ReactElement } from 'react'
import { FolderTree, ShieldAlert } from 'lucide-react'
import type { FileEntry } from '@shared/ipc'
import { MillerColumns } from './MillerColumns'
import { ExplorerContextMenu } from './ContextMenu'
import { useExplorer } from './useExplorer'

interface ContextMenuState {
  entry: FileEntry
  relPath: string
  position: { clientX: number; clientY: number }
}

export interface ExplorerPaneProps {
  workspaceId: string
}

/**
 * Explorer sub-app root — a macOS-Finder-style Miller-column file browser.
 * Owns no IPC of its own beyond the `window.ws.explorer.*` calls the
 * `useExplorer` hook makes; this component is the view + the `needs-grant`
 * prompt surface. Mirrors the `{ workspaceId }` prop contract of TodoPane /
 * DashboardPane so it drops into the same App.tsx mount switch.
 */
export function ExplorerPane({ workspaceId }: ExplorerPaneProps): ReactElement {
  const explorer = useExplorer(workspaceId)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const onOpenFile = useCallback(
    (entry: FileEntry) => {
      void explorer.openFile(entry)
    },
    [explorer],
  )

  const onContextMenu = useCallback(
    (entry: FileEntry, relPath: string, position: { clientX: number; clientY: number }) => {
      setContextMenu({ entry, relPath, position })
    },
    [],
  )

  const onResolveGrant = useCallback(() => {
    void explorer.resolveGrant()
  }, [explorer])

  return (
    <div className="flex h-full flex-col bg-bg text-fg">
      <header className="flex items-center gap-2 border-b border-border bg-bg-sunken px-4 py-2">
        <FolderTree size={16} className="text-accent" aria-hidden="true" />
        <h1 className="text-sm font-semibold tracking-tight">Explorer</h1>
        <span className="ml-1 text-xs text-muted">Miller columns</span>
      </header>

      {explorer.grantPrompt && (
        <div
          role="alertdialog"
          aria-labelledby="explorer-grant-title"
          aria-describedby="explorer-grant-desc"
          className="flex items-center gap-3 border-b border-border bg-warn/10 px-4 py-2.5"
        >
          <ShieldAlert size={16} className="shrink-0 text-warn" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p id="explorer-grant-title" className="text-xs font-semibold text-fg">
              This folder is outside the workspace scope
            </p>
            <p
              id="explorer-grant-desc"
              className="truncate text-[11px] text-muted"
              title={explorer.grantPrompt.path}
            >
              {explorer.grantPrompt.path}
            </p>
          </div>
          <button
            type="button"
            onClick={onResolveGrant}
            className="shrink-0 rounded-sm border border-accent bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
          >
            Grant access
          </button>
          <button
            type="button"
            onClick={explorer.dismissGrant}
            className="shrink-0 rounded-sm border border-border px-2.5 py-1 text-xs text-muted hover:text-fg"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1">
        <MillerColumns
          columns={explorer.columns}
          metadata={explorer.metadata}
          onSelect={explorer.select}
          onActivate={explorer.activate}
          onOpenFile={onOpenFile}
          onContextMenu={onContextMenu}
        />
      </div>

      {contextMenu && (
        <ExplorerContextMenu
          workspaceId={workspaceId}
          entry={contextMenu.entry}
          relPath={contextMenu.relPath}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
