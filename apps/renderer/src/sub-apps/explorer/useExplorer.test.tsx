// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExplorerListDirResponse, FileEntry } from '@shared/ipc'
import {
  descend,
  fillColumn,
  joinRel,
  metadataTarget,
  relPathOf,
  useExplorer,
  type ExplorerApi,
  type ExplorerColumn,
} from './useExplorer'

// React's act(...) requires this flag to recognise the test environment.
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const WORKSPACE = '00000000-0000-4000-8000-000000000001'

function entry(name: string, type: 'file' | 'dir', extra: Partial<FileEntry> = {}): FileEntry {
  return { name, path: `/abs/${name}`, type, size: type === 'dir' ? 0 : 10, ...extra }
}

function column(relPath: string, entries: FileEntry[]): ExplorerColumn {
  return { relPath, entries, selectedIndex: 0, loading: false }
}

describe('explorer pure transitions', () => {
  it('joinRel uses POSIX separators and treats "" as root', () => {
    expect(joinRel('', 'src')).toBe('src')
    expect(joinRel('src', 'lib')).toBe('src/lib')
  })

  it('descend into a folder appends a loading child column', () => {
    const state = {
      columns: [column('', [entry('src', 'dir'), entry('a.ts', 'file')])],
      grantPrompt: null,
    }
    const next = descend(state, 0, 0)
    expect(next.columns).toHaveLength(2)
    expect(next.columns[0]?.selectedIndex).toBe(0)
    expect(next.columns[1]).toMatchObject({ relPath: 'src', loading: true })
  })

  it('descend onto a file does NOT append a column but selects it', () => {
    const state = {
      columns: [column('', [entry('src', 'dir'), entry('a.ts', 'file')])],
      grantPrompt: null,
    }
    const next = descend(state, 0, 1)
    expect(next.columns).toHaveLength(1)
    expect(next.columns[0]?.selectedIndex).toBe(1)
  })

  it('descend re-branching truncates deeper columns', () => {
    const state = {
      columns: [
        column('', [entry('src', 'dir'), entry('docs', 'dir')]),
        column('src', [entry('x.ts', 'file')]),
      ],
      grantPrompt: null,
    }
    const next = descend(state, 0, 1)
    expect(next.columns).toHaveLength(2)
    expect(next.columns[1]?.relPath).toBe('docs')
  })

  it('metadataTarget picks the deepest selected file, null on a directory', () => {
    const fileCol = column('src', [entry('x.ts', 'file')])
    expect(metadataTarget([fileCol])?.name).toBe('x.ts')
    expect(metadataTarget([column('', [entry('src', 'dir')])])).toBeNull()
  })

  it('relPathOf resolves an entry to its workspace-relative path', () => {
    const e = entry('x.ts', 'file')
    expect(relPathOf([column('src', [e])], e)).toBe('src/x.ts')
    expect(relPathOf([column('', [])], e)).toBeNull()
  })

  it('fillColumn replaces a loading column with its listing', () => {
    const state = {
      columns: [{ relPath: '', entries: [], selectedIndex: 0, loading: true }],
      grantPrompt: null,
    }
    const next = fillColumn(state, 0, [entry('a.ts', 'file')])
    expect(next.columns[0]).toMatchObject({ loading: false })
    expect(next.columns[0]?.entries).toHaveLength(1)
  })
})

interface WsMock {
  listDir: ReturnType<typeof vi.fn>
  open: ReturnType<typeof vi.fn>
  reveal: ReturnType<typeof vi.fn>
  requestPath: ReturnType<typeof vi.fn>
}

function installWsMock(): WsMock {
  const listDir = vi.fn<(w: string, r: string) => Promise<ExplorerListDirResponse>>()
  const open = vi.fn().mockResolvedValue({ opened: true })
  const reveal = vi.fn().mockResolvedValue(undefined)
  const requestPath = vi.fn()
  ;(globalThis as unknown as { window: Window }).window = globalThis.window ?? ({} as Window)
  Object.defineProperty(window, 'ws', {
    configurable: true,
    value: {
      explorer: { listDir, open, reveal },
      permissions: { requestPath },
    },
  })
  return { listDir, open, reveal, requestPath }
}

// Drive the hook through a host component so its effects run under React.
function renderHook(): { root: Root; container: HTMLElement; current: () => ExplorerApi } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  let latest: ExplorerApi | null = null
  function Host(): null {
    latest = useExplorer(WORKSPACE)
    return null
  }
  act(() => {
    root.render(<Host />)
  })
  return {
    root,
    container,
    current: () => {
      if (!latest) throw new Error('hook not mounted')
      return latest
    },
  }
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useExplorer (async flow)', () => {
  let ws: WsMock

  beforeEach(() => {
    ws = installWsMock()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists the root column on mount', async () => {
    ws.listDir.mockResolvedValue({
      status: 'ok',
      relPath: '',
      entries: [entry('src', 'dir'), entry('readme.md', 'file')],
    })
    const h = renderHook()
    await flush()
    expect(ws.listDir).toHaveBeenCalledWith(WORKSPACE, '')
    expect(h.current().columns[0]?.entries).toHaveLength(2)
    act(() => h.root.unmount())
  })

  it('descending into a folder appends a column and lists its contents', async () => {
    ws.listDir
      .mockResolvedValueOnce({ status: 'ok', relPath: '', entries: [entry('src', 'dir')] })
      .mockResolvedValueOnce({ status: 'ok', relPath: 'src', entries: [entry('index.ts', 'file')] })
    const h = renderHook()
    await flush()
    act(() => h.current().activate(0, 0))
    await flush()
    expect(h.current().columns).toHaveLength(2)
    expect(ws.listDir).toHaveBeenLastCalledWith(WORKSPACE, 'src')
    expect(h.current().columns[1]?.entries[0]?.name).toBe('index.ts')
    act(() => h.root.unmount())
  })

  it('selecting a file populates the metadata target', async () => {
    ws.listDir.mockResolvedValue({
      status: 'ok',
      relPath: '',
      entries: [entry('a.ts', 'file', { gitStatus: 'modified', size: 42 })],
    })
    const h = renderHook()
    await flush()
    act(() => h.current().select(0, 0))
    await flush()
    expect(h.current().metadata).toMatchObject({ name: 'a.ts', gitStatus: 'modified' })
    act(() => h.root.unmount())
  })

  it('surfaces the grant path when listDir returns needs-grant', async () => {
    ws.listDir.mockResolvedValue({ status: 'needs-grant', path: '/outside/scope' })
    const h = renderHook()
    await flush()
    expect(h.current().grantPrompt?.path).toBe('/outside/scope')
    expect(h.current().columns[0]?.loading).toBe(true)
    act(() => h.root.unmount())
  })

  it('resolving a granted prompt re-lists the blocked column', async () => {
    ws.listDir
      .mockResolvedValueOnce({ status: 'needs-grant', path: '/outside/scope' })
      .mockResolvedValueOnce({ status: 'ok', relPath: '', entries: [entry('granted.ts', 'file')] })
    ws.requestPath.mockResolvedValue({ granted: true, alwaysAllow: false, grant: null })
    const h = renderHook()
    await flush()
    expect(h.current().grantPrompt).not.toBeNull()
    await act(async () => {
      await h.current().resolveGrant()
    })
    await flush()
    expect(ws.requestPath).toHaveBeenCalledWith({
      workspaceId: WORKSPACE,
      path: '/outside/scope',
      kind: 'read',
    })
    expect(h.current().grantPrompt).toBeNull()
    expect(h.current().columns[0]?.entries[0]?.name).toBe('granted.ts')
    act(() => h.root.unmount())
  })

  it('openFile routes the workspace-relative path through ws.explorer.open', async () => {
    ws.listDir.mockResolvedValue({ status: 'ok', relPath: '', entries: [entry('a.ts', 'file')] })
    const h = renderHook()
    await flush()
    const target = h.current().columns[0]?.entries[0]
    if (!target) throw new Error('no entry')
    await act(async () => {
      await h.current().openFile(target)
    })
    expect(ws.open).toHaveBeenCalledWith(WORKSPACE, 'a.ts')
    act(() => h.root.unmount())
  })
})
