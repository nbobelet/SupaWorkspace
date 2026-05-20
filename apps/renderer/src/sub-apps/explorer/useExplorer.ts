import { useCallback, useEffect, useState } from 'react'
import type { ExplorerListDirResponse, ExplorerReadFileResponse, FileEntry } from '@shared/ipc'

/**
 * One Miller column = the listing of a single directory plus the index of the
 * row the user is currently sitting on. `relPath` is relative to the workspace
 * rootPath ('' = root). `parentPath` is the relPath whose folder produced this
 * column (kept so the metadata panel can re-resolve a child relPath without
 * re-deriving it from absolute paths, which differ per OS separator).
 */
export interface ExplorerColumn {
  relPath: string
  entries: FileEntry[]
  selectedIndex: number
  loading: boolean
}

/**
 * Surfaced when listDir returns `needs-grant` (the Home workspace with a null
 * rootPath, or any out-of-scope directory). The renderer routes `path` through
 * `window.ws.permissions.requestPath`; on grant it re-lists the same column.
 */
export interface ExplorerGrantPrompt {
  /** Absolute path main reported as out-of-scope. */
  path: string
  /** Column index whose expansion triggered the prompt (-1 = root). */
  forColumnAfter: number
  /** relPath the blocked listDir was attempting. */
  relPath: string
}

export interface ExplorerState {
  columns: ExplorerColumn[]
  grantPrompt: ExplorerGrantPrompt | null
}

/** Join a parent relPath with a child name using POSIX separators (relPaths are
 * always workspace-relative POSIX, normalised by main — never OS-specific). */
export function joinRel(relPath: string, name: string): string {
  return relPath === '' ? name : `${relPath}/${name}`
}

/** Currently selected entry of a column, if the cursor sits on a real row. */
export function selectedEntry(column: ExplorerColumn | undefined): FileEntry | null {
  if (!column) return null
  return column.entries[column.selectedIndex] ?? null
}

/**
 * The file whose metadata the placeholder panel renders: the selected entry of
 * the deepest column that points at a file. Returns null when the deepest
 * selection is a directory (its contents already occupy the next column).
 */
export function metadataTarget(columns: ExplorerColumn[]): FileEntry | null {
  for (let i = columns.length - 1; i >= 0; i -= 1) {
    const entry = selectedEntry(columns[i])
    if (entry && entry.type === 'file') return entry
  }
  return null
}

/**
 * Pure transition: descending into the folder at `entryIndex` of column
 * `columnIndex`. Truncates any deeper columns (we are re-branching), marks the
 * source row selected, and appends a fresh loading column for the child dir.
 * Selecting a file truncates deeper columns without appending one.
 */
export function descend(
  state: ExplorerState,
  columnIndex: number,
  entryIndex: number,
): ExplorerState {
  const column = state.columns[columnIndex]
  if (!column) return state
  const entry = column.entries[entryIndex]
  if (!entry) return state

  const kept = state.columns
    .slice(0, columnIndex + 1)
    .map((c, i) => (i === columnIndex ? { ...c, selectedIndex: entryIndex } : c))

  if (entry.type === 'dir') {
    kept.push({
      relPath: joinRel(column.relPath, entry.name),
      entries: [],
      selectedIndex: 0,
      loading: true,
    })
  }

  return { columns: kept, grantPrompt: null }
}

/** Fill a previously-loading column with its listing (or replace in place on
 * re-list after a grant). No-op if the column index drifted away meanwhile. */
export function fillColumn(
  state: ExplorerState,
  columnIndex: number,
  entries: FileEntry[],
): ExplorerState {
  const target = state.columns[columnIndex]
  if (!target) return state
  const columns = state.columns.map((c, i) =>
    i === columnIndex ? { ...c, entries, selectedIndex: 0, loading: false } : c,
  )
  return { ...state, columns }
}

const ROOT_COLUMN: ExplorerColumn = {
  relPath: '',
  entries: [],
  selectedIndex: 0,
  loading: true,
}

const INITIAL: ExplorerState = { columns: [ROOT_COLUMN], grantPrompt: null }

/**
 * Preview of the metadata-target file's content for the rightmost panel.
 * `idle` = nothing selected (or a directory). `loaded` carries the discriminated
 * IPC response (text / image / binary / needs-grant). Keyed on the target file
 * so switching selection refetches.
 */
export type PreviewState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'loaded'; result: ExplorerReadFileResponse }
  | { kind: 'error'; message: string }

export interface ExplorerApi {
  /** Live column stack (root is always columns[0]). */
  columns: ExplorerColumn[]
  /** File whose metadata the rightmost placeholder panel should render. */
  metadata: FileEntry | null
  /** Content preview of the metadata-target file. */
  preview: PreviewState
  /** Re-fetch the current preview target uncapped (the "Load full file" path). */
  loadFullPreview: () => Promise<void>
  /** Pending out-of-scope grant prompt, if any. */
  grantPrompt: ExplorerGrantPrompt | null
  /** Select a row without descending (cursor move within a column). */
  select: (columnIndex: number, entryIndex: number) => void
  /** Descend into a folder / select a file at (columnIndex, entryIndex). */
  activate: (columnIndex: number, entryIndex: number) => void
  /** Open a file in the OS / configured editor (Enter on a file row). */
  openFile: (entry: FileEntry) => Promise<void>
  /** Request the pending grant, then re-list the blocked column on success. */
  resolveGrant: () => Promise<void>
  /** Dismiss the grant prompt without requesting access. */
  dismissGrant: () => void
}

/**
 * Owns the Miller-column stack for one workspace. Lazily lists a directory the
 * moment a column is appended in a `loading` state; the effect that watches the
 * deepest loading column fires the `listDir` IPC and either fills it, surfaces a
 * `needs-grant` prompt, or drops the column on error. Re-keys the whole stack
 * when `workspaceId` changes.
 */
export function useExplorer(workspaceId: string): ExplorerApi {
  const [state, setState] = useState<ExplorerState>(INITIAL)
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' })

  useEffect(() => {
    setState(INITIAL)
  }, [workspaceId])

  const target = metadataTarget(state.columns)
  const targetRel = target ? relPathOf(state.columns, target) : null

  // Fetch a capped preview whenever the metadata target changes. Keyed on the
  // resolved relPath (POSIX, OS-stable) rather than the absolute path so a
  // re-list that re-creates entries doesn't spuriously refetch.
  useEffect(() => {
    if (!targetRel) {
      setPreview({ kind: 'idle' })
      return
    }
    let cancelled = false
    setPreview({ kind: 'loading' })
    window.ws.explorer
      .readFile(workspaceId, targetRel, false)
      .then((result) => {
        if (!cancelled) setPreview({ kind: 'loaded', result })
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPreview({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId, targetRel])

  const loadFullPreview = useCallback(async (): Promise<void> => {
    if (!targetRel) return
    setPreview({ kind: 'loading' })
    try {
      const result = await window.ws.explorer.readFile(workspaceId, targetRel, true)
      setPreview({ kind: 'loaded', result })
    } catch (err) {
      setPreview({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
    }
  }, [workspaceId, targetRel])

  const listInto = useCallback(
    async (columnIndex: number, relPath: string): Promise<void> => {
      let res: ExplorerListDirResponse
      try {
        res = await window.ws.explorer.listDir(workspaceId, relPath)
      } catch {
        // Listing failed hard (deleted dir, race). Drop the dangling column so
        // the UI falls back to its parent rather than spinning forever.
        setState((prev) => ({
          ...prev,
          columns: prev.columns.filter((_, i) => i !== columnIndex || columnIndex === 0),
        }))
        return
      }
      if (res.status === 'needs-grant') {
        setState((prev) => ({
          ...prev,
          grantPrompt: { path: res.path, forColumnAfter: columnIndex - 1, relPath },
        }))
        return
      }
      setState((prev) => fillColumn(prev, columnIndex, res.entries))
    },
    [workspaceId],
  )

  // Lazy expansion: whenever the deepest column is flagged loading, fetch it.
  useEffect(() => {
    const idx = state.columns.findIndex((c) => c.loading)
    if (idx === -1) return
    const column = state.columns[idx]
    if (!column) return
    void listInto(idx, column.relPath)
  }, [state.columns, listInto])

  const select = useCallback((columnIndex: number, entryIndex: number) => {
    setState((prev) => {
      const column = prev.columns[columnIndex]
      if (!column || !column.entries[entryIndex]) return prev
      const columns = prev.columns.map((c, i) =>
        i === columnIndex ? { ...c, selectedIndex: entryIndex } : c,
      )
      // Selecting (vs. activating) a non-dir collapses any deeper columns so the
      // metadata panel reflects the new cursor without a stale child listing.
      const entry = column.entries[entryIndex]
      const trimmed = entry.type === 'dir' ? columns : columns.slice(0, columnIndex + 1)
      return { ...prev, columns: trimmed }
    })
  }, [])

  const activate = useCallback((columnIndex: number, entryIndex: number) => {
    setState((prev) => descend(prev, columnIndex, entryIndex))
  }, [])

  const openFile = useCallback(
    async (entry: FileEntry): Promise<void> => {
      const relPath = relPathOf(state.columns, entry)
      if (relPath === null) return
      await window.ws.explorer.open(workspaceId, relPath)
    },
    [state.columns, workspaceId],
  )

  const resolveGrant = useCallback(async (): Promise<void> => {
    const prompt = state.grantPrompt
    if (!prompt) return
    const res = await window.ws.permissions.requestPath({
      workspaceId,
      path: prompt.path,
      kind: 'read',
    })
    if (!res.granted) {
      setState((prev) => ({ ...prev, grantPrompt: null }))
      return
    }
    // Re-mount the blocked column as loading so the lazy effect re-lists it.
    setState((prev) => {
      const at = prompt.forColumnAfter + 1
      const columns = prev.columns.slice(0, at)
      columns.push({ relPath: prompt.relPath, entries: [], selectedIndex: 0, loading: true })
      return { columns, grantPrompt: null }
    })
  }, [state.grantPrompt, workspaceId])

  const dismissGrant = useCallback(() => {
    setState((prev) => ({ ...prev, grantPrompt: null }))
  }, [])

  return {
    columns: state.columns,
    metadata: target,
    preview,
    loadFullPreview,
    grantPrompt: state.grantPrompt,
    select,
    activate,
    openFile,
    resolveGrant,
    dismissGrant,
  }
}

/** Resolve the workspace-relative path of an entry by locating the column that
 * lists it. Falls back to null when the entry is no longer in any live column. */
export function relPathOf(columns: ExplorerColumn[], entry: FileEntry): string | null {
  for (const column of columns) {
    if (column.entries.some((e) => e.path === entry.path)) {
      return joinRel(column.relPath, entry.name)
    }
  }
  return null
}
