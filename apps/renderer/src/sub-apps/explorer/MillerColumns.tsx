import { useCallback, useRef, type KeyboardEvent, type ReactElement } from 'react'
import { ChevronRight, File as FileIcon, Folder } from 'lucide-react'
import type { FileEntry, FileGitStatus } from '@shared/ipc'
import type { ExplorerColumn, PreviewState } from './useExplorer'
import { FilePreview } from './FilePreview'

export interface MillerColumnsProps {
  columns: ExplorerColumn[]
  metadata: FileEntry | null
  /** Content preview of the metadata target. */
  preview: PreviewState
  /** Re-fetch the preview uncapped (wired to the "Load full file" button). */
  onLoadFull: () => void
  onSelect: (columnIndex: number, entryIndex: number) => void
  onActivate: (columnIndex: number, entryIndex: number) => void
  onOpenFile: (entry: FileEntry) => void
  /**
   * Clean seam for Wave 3 (open-in-editor / reveal context menu). Receives the
   * row's FileEntry and its workspace-relative path so the menu can call
   * `window.ws.explorer.open|reveal` without re-deriving paths. No menu UI here.
   */
  onContextMenu?: (
    entry: FileEntry,
    relPath: string,
    event: { clientX: number; clientY: number },
  ) => void
}

/**
 * Git status → design token. Colors live ONLY as `--ansi-*` custom properties
 * (see styles/index.css) so flipping the palette re-themes the decorations with
 * everything else. `ignored` dims to muted; unknown future states never reach
 * here (main collapses them to `modified`).
 */
const GIT_STATUS_TOKEN: Record<FileGitStatus, string> = {
  modified: 'var(--ansi-yellow)',
  added: 'var(--ansi-green)',
  untracked: 'var(--ansi-green)',
  deleted: 'var(--ansi-red)',
  conflicted: 'var(--ansi-red)',
  renamed: 'var(--ansi-blue)',
  ignored: 'var(--color-muted)',
}

const GIT_STATUS_GLYPH: Record<FileGitStatus, string> = {
  modified: 'M',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
  conflicted: 'C',
  renamed: 'R',
  ignored: 'I',
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function ColumnSkeleton(): ReactElement {
  // Placeholder rows while listDir is in flight. No layout flash: same row
  // height and gutter as a real row. `motion-reduce` kills the pulse to honour
  // prefers-reduced-motion (also enforced globally in index.css).
  return (
    <ul aria-hidden="true" className="flex flex-col gap-px p-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <li
          key={i}
          className="flex h-7 items-center gap-2 rounded-sm px-2"
          style={{ opacity: 1 - i * 0.1 }}
        >
          <span className="size-3.5 shrink-0 animate-pulse rounded-sm bg-fg/10 motion-reduce:animate-none" />
          <span
            className="h-3 animate-pulse rounded-sm bg-fg/10 motion-reduce:animate-none"
            style={{ width: `${70 - i * 6}%` }}
          />
        </li>
      ))}
    </ul>
  )
}

interface ColumnViewProps {
  column: ExplorerColumn
  columnIndex: number
  isActiveColumn: boolean
  onSelect: (columnIndex: number, entryIndex: number) => void
  onActivate: (columnIndex: number, entryIndex: number) => void
  onOpenFile: (entry: FileEntry) => void
  onFocusColumn: (columnIndex: number) => void
  onContextMenu: MillerColumnsProps['onContextMenu']
}

function ColumnView({
  column,
  columnIndex,
  isActiveColumn,
  onSelect,
  onActivate,
  onOpenFile,
  onFocusColumn,
  onContextMenu,
}: ColumnViewProps): ReactElement {
  const listRef = useRef<HTMLUListElement>(null)

  const focusRow = useCallback((index: number) => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-row-index="${index}"]`)
    row?.focus()
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLUListElement>) => {
      const { entries, selectedIndex } = column
      if (entries.length === 0) return
      switch (event.key) {
        case 'ArrowDown': {
          event.preventDefault()
          const next = Math.min(selectedIndex + 1, entries.length - 1)
          onSelect(columnIndex, next)
          focusRow(next)
          break
        }
        case 'ArrowUp': {
          event.preventDefault()
          const prev = Math.max(selectedIndex - 1, 0)
          onSelect(columnIndex, prev)
          focusRow(prev)
          break
        }
        case 'Home': {
          event.preventDefault()
          onSelect(columnIndex, 0)
          focusRow(0)
          break
        }
        case 'End': {
          event.preventDefault()
          const last = entries.length - 1
          onSelect(columnIndex, last)
          focusRow(last)
          break
        }
        case 'ArrowRight': {
          // Descend into a folder; the new column gets focus once it lists.
          const entry = entries[selectedIndex]
          if (entry?.type === 'dir') {
            event.preventDefault()
            onActivate(columnIndex, selectedIndex)
          }
          break
        }
        case 'ArrowLeft': {
          // Step back to the parent column, focusing the row that owns us.
          if (columnIndex > 0) {
            event.preventDefault()
            onFocusColumn(columnIndex - 1)
          }
          break
        }
        case 'Enter': {
          event.preventDefault()
          const entry = entries[selectedIndex]
          if (!entry) break
          if (entry.type === 'dir') onActivate(columnIndex, selectedIndex)
          else onOpenFile(entry)
          break
        }
        default:
          break
      }
    },
    [column, columnIndex, focusRow, onActivate, onFocusColumn, onOpenFile, onSelect],
  )

  return (
    <div
      className="supa-scroll h-full w-60 shrink-0 overflow-y-auto border-r border-border bg-bg"
      data-column-index={columnIndex}
    >
      {column.loading ? (
        <ColumnSkeleton />
      ) : column.entries.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted">Empty folder</p>
      ) : (
        <ul
          ref={listRef}
          role="tree"
          aria-label={column.relPath === '' ? 'Workspace root' : column.relPath}
          aria-orientation="vertical"
          className="flex flex-col gap-px p-1 outline-none"
          onKeyDown={onKeyDown}
        >
          {column.entries.map((entry, entryIndex) => {
            const selected = entryIndex === column.selectedIndex
            const isDir = entry.type === 'dir'
            // Roving tabindex: only the selected row of each column is tabbable.
            const tabIndex = selected ? 0 : -1
            const statusColor = entry.gitStatus ? GIT_STATUS_TOKEN[entry.gitStatus] : undefined
            return (
              <li key={entry.path} role="none">
                <div
                  role="treeitem"
                  aria-selected={selected}
                  aria-expanded={isDir ? selected && !isActiveColumn : undefined}
                  aria-label={`${entry.name}${entry.gitStatus ? `, ${entry.gitStatus}` : ''}`}
                  data-row-index={entryIndex}
                  tabIndex={tabIndex}
                  onFocus={() => onFocusColumn(columnIndex)}
                  onClick={() => onSelect(columnIndex, entryIndex)}
                  onDoubleClick={() =>
                    isDir ? onActivate(columnIndex, entryIndex) : onOpenFile(entry)
                  }
                  onContextMenu={(event) => {
                    if (!onContextMenu) return
                    event.preventDefault()
                    const relPath =
                      column.relPath === '' ? entry.name : `${column.relPath}/${entry.name}`
                    onContextMenu(entry, relPath, {
                      clientX: event.clientX,
                      clientY: event.clientY,
                    })
                  }}
                  className={[
                    'flex h-7 cursor-default select-none items-center gap-2 rounded-sm px-2 text-xs',
                    selected
                      ? 'bg-accent/15 text-fg'
                      : 'text-fg-subtle hover:bg-fg/5 hover:text-fg',
                  ].join(' ')}
                >
                  {isDir ? (
                    <Folder size={14} className="shrink-0 text-muted" aria-hidden="true" />
                  ) : (
                    <FileIcon size={14} className="shrink-0 text-muted" aria-hidden="true" />
                  )}
                  <span
                    className="min-w-0 flex-1 truncate"
                    style={statusColor ? { color: statusColor } : undefined}
                    title={entry.name}
                  >
                    {entry.name}
                  </span>
                  {entry.gitStatus && (
                    <span
                      aria-hidden="true"
                      className="shrink-0 font-mono text-[10px] font-semibold leading-none"
                      style={{ color: statusColor }}
                      title={entry.gitStatus}
                    >
                      {GIT_STATUS_GLYPH[entry.gitStatus]}
                    </span>
                  )}
                  {isDir && (
                    <ChevronRight size={12} className="shrink-0 text-muted" aria-hidden="true" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

/**
 * Rightmost panel: file metadata (name, type, size, git status) stacked above a
 * live content preview (syntax-highlighted text, inline image, or a notice).
 * The meta block is fixed; the preview region owns its own scroll. Renders an
 * empty hint when the deepest selection is a directory.
 */
function MetadataPanel({
  entry,
  preview,
  onLoadFull,
}: {
  entry: FileEntry | null
  preview: PreviewState
  onLoadFull: () => void
}): ReactElement {
  if (!entry) {
    return (
      <div className="flex h-full w-96 shrink-0 items-center justify-center bg-bg-sunken px-4 text-center">
        <p className="text-xs text-muted">Select a file to see its details.</p>
      </div>
    )
  }
  const statusColor = entry.gitStatus ? GIT_STATUS_TOKEN[entry.gitStatus] : undefined
  return (
    <div className="flex h-full w-96 shrink-0 flex-col bg-bg-sunken" aria-label="File details">
      <div className="flex shrink-0 flex-col gap-3 border-b border-border p-4">
        <div className="flex flex-col items-center gap-2 text-center">
          <FileIcon size={32} className="text-muted" aria-hidden="true" />
          <p className="break-all text-sm font-semibold text-fg" title={entry.name}>
            {entry.name}
          </p>
        </div>
        <dl className="flex flex-col gap-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">Type</dt>
            <dd className="text-fg-subtle">{entry.type === 'dir' ? 'Folder' : 'File'}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">Size</dt>
            <dd className="text-fg-subtle">{formatSize(entry.size)}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-muted">Git status</dt>
            <dd className="font-medium" style={statusColor ? { color: statusColor } : undefined}>
              {entry.gitStatus ?? 'clean'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="min-h-0 flex-1">
        <FilePreview fileName={entry.name} preview={preview} onLoadFull={onLoadFull} />
      </div>
    </div>
  )
}

/**
 * Finder-style Miller columns. Clicking a folder in column N opens its contents
 * in column N+1; selecting a file collapses deeper columns and the rightmost
 * metadata panel describes it. The row of columns scrolls horizontally; each
 * column scrolls vertically. Every scroll root wears `.supa-scroll`.
 */
export function MillerColumns({
  columns,
  metadata,
  preview,
  onLoadFull,
  onSelect,
  onActivate,
  onOpenFile,
  onContextMenu,
}: MillerColumnsProps): ReactElement {
  const focusColumn = useCallback((columnIndex: number) => {
    const column = document.querySelector<HTMLElement>(`[data-column-index="${columnIndex}"]`)
    const row =
      column?.querySelector<HTMLElement>('[data-row-index][tabindex="0"]') ??
      column?.querySelector<HTMLElement>('[data-row-index]')
    row?.focus()
  }, [])

  const activeColumnIndex = columns.length - 1

  return (
    <div
      className="supa-scroll flex h-full overflow-x-auto bg-bg"
      role="group"
      aria-label="File browser columns"
    >
      {columns.map((column, columnIndex) => (
        <ColumnView
          key={`${columnIndex}:${column.relPath}`}
          column={column}
          columnIndex={columnIndex}
          isActiveColumn={columnIndex === activeColumnIndex}
          onSelect={onSelect}
          onActivate={onActivate}
          onOpenFile={onOpenFile}
          onFocusColumn={focusColumn}
          onContextMenu={onContextMenu}
        />
      ))}
      <MetadataPanel entry={metadata} preview={preview} onLoadFull={onLoadFull} />
    </div>
  )
}
