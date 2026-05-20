import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc'

type Handler = (event: unknown, raw: unknown) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
  dialog: { showOpenDialog: vi.fn() },
  shell: { openPath: vi.fn() },
}))

const WS = '550e8400-e29b-41d4-a716-446655440099'

function makeOpts() {
  return {
    workspaceStore: {
      softDelete: vi.fn(),
      restore: vi.fn(() => ({ id: WS })),
      purge: vi.fn(),
      listDeleted: vi.fn(() => []),
    },
    sessionManager: { killAllInWorkspace: vi.fn() },
    notesStore: { remove: vi.fn() },
    supattyStore: { remove: vi.fn() },
    todoStore: { remove: vi.fn() },
    getMainWindow: () => null,
  }
}

beforeEach(() => handlers.clear())

describe('workspace IPC — soft delete vs purge', () => {
  it('WorkspaceRemove soft-deletes and leaves notes/todo/supatty data INTACT', async () => {
    const { registerWorkspaceIpc } = await import('./workspace')
    const opts = makeOpts()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWorkspaceIpc(opts as any)

    await handlers.get(IpcChannel.WorkspaceRemove)?.({}, { workspaceId: WS })

    expect(opts.sessionManager.killAllInWorkspace).toHaveBeenCalledWith(WS)
    expect(opts.workspaceStore.softDelete).toHaveBeenCalledWith(WS)
    // Tony's invariant: sub-app payloads survive a soft delete.
    expect(opts.notesStore.remove).not.toHaveBeenCalled()
    expect(opts.todoStore.remove).not.toHaveBeenCalled()
    expect(opts.supattyStore.remove).not.toHaveBeenCalled()
    expect(opts.workspaceStore.purge).not.toHaveBeenCalled()
  })

  it('WorkspacePurge cascades the permanent delete across sub-app stores', async () => {
    const { registerWorkspaceIpc } = await import('./workspace')
    const opts = makeOpts()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWorkspaceIpc(opts as any)

    await handlers.get(IpcChannel.WorkspacePurge)?.({}, { workspaceId: WS })

    expect(opts.notesStore.remove).toHaveBeenCalledWith(WS)
    expect(opts.todoStore.remove).toHaveBeenCalledWith(WS)
    expect(opts.supattyStore.remove).toHaveBeenCalledWith(WS)
    expect(opts.workspaceStore.purge).toHaveBeenCalledWith(WS)
  })

  it('WorkspaceRestore delegates to the store', async () => {
    const { registerWorkspaceIpc } = await import('./workspace')
    const opts = makeOpts()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    registerWorkspaceIpc(opts as any)

    await handlers.get(IpcChannel.WorkspaceRestore)?.({}, { workspaceId: WS })

    expect(opts.workspaceStore.restore).toHaveBeenCalledWith(WS)
  })
})
