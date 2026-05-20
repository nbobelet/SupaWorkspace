import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const openPathMock = vi.fn<(p: string) => Promise<string>>()
const showItemInFolderMock = vi.fn<(p: string) => void>()

vi.mock('electron', () => ({
  shell: {
    openPath: (p: string) => openPathMock(p),
    showItemInFolder: (p: string) => showItemInFolderMock(p),
  },
}))

import { openPath, revealInFileManager } from './shell-actions'

describe('shell-actions: openPath', () => {
  beforeEach(() => {
    openPathMock.mockReset()
    showItemInFolderMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes to shell.openPath and reports success on empty error string', async () => {
    openPathMock.mockResolvedValue('')
    const res = await openPath('/abs/workspace/a.ts')
    expect(openPathMock).toHaveBeenCalledWith('/abs/workspace/a.ts')
    expect(res).toEqual({ opened: true })
  })

  it('reports failure and surfaces the OS error string', async () => {
    openPathMock.mockResolvedValue('No application set')
    const res = await openPath('/abs/workspace/a.ts')
    expect(res).toEqual({ opened: false, error: 'No application set' })
  })
})

describe('shell-actions: revealInFileManager', () => {
  beforeEach(() => {
    openPathMock.mockReset()
    showItemInFolderMock.mockReset()
  })

  it('routes to shell.showItemInFolder and reports the request was issued', () => {
    const res = revealInFileManager('/abs/workspace/dir')
    expect(showItemInFolderMock).toHaveBeenCalledWith('/abs/workspace/dir')
    expect(res).toEqual({ revealed: true })
  })

  // Cross-platform: `shell.showItemInFolder` opens Explorer (win32), Finder
  // (darwin), or the default file manager (linux). The single Electron call is
  // OS-agnostic — the absolute path it receives is the only platform-specific
  // surface, and that path is built+clamped upstream (`clampToScope`) using
  // node:path so the separator already matches the host OS. These reveal paths
  // therefore exercise identical code on all three targets.
  it.each([
    ['win32 backslash path', 'C:\\Users\\nico\\ws\\file.txt'],
    ['darwin posix path', '/Users/nico/ws/file.txt'],
    ['linux posix path', '/home/nico/ws/file.txt'],
  ])('passes the clamped absolute path through unchanged (%s)', (_label, absPath) => {
    revealInFileManager(absPath)
    expect(showItemInFolderMock).toHaveBeenCalledWith(absPath)
  })
})
