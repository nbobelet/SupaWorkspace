import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotesStore } from './notesStore'

describe('notesStore', () => {
  const setMock = vi.fn(async (_workspaceId: string, _content: string) => undefined)
  const getMock = vi.fn(async (workspaceId: string) => ({
    content: workspaceId === 'ws-A' ? 'notes for A' : workspaceId === 'ws-B' ? 'notes for B' : '',
  }))

  beforeEach(() => {
    setMock.mockClear()
    getMock.mockClear()
    ;(globalThis as { window?: unknown }).window = {
      ws: { notes: { get: getMock, set: setMock } },
    }
    useNotesStore.setState({ byWorkspace: {}, loadedFor: {} })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads content per workspace and caches the result', async () => {
    await useNotesStore.getState().load('ws-A')
    expect(useNotesStore.getState().byWorkspace['ws-A']).toBe('notes for A')
    expect(getMock).toHaveBeenCalledTimes(1)

    await useNotesStore.getState().load('ws-A')
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('isolates notes per workspace — content does not bleed across workspaces', async () => {
    await useNotesStore.getState().load('ws-A')
    await useNotesStore.getState().load('ws-B')

    useNotesStore.getState().setContent('ws-A', 'edited in A')
    expect(useNotesStore.getState().byWorkspace['ws-A']).toBe('edited in A')
    expect(useNotesStore.getState().byWorkspace['ws-B']).toBe('notes for B')

    useNotesStore.getState().setContent('ws-B', 'edited in B')
    expect(useNotesStore.getState().byWorkspace['ws-A']).toBe('edited in A')
    expect(useNotesStore.getState().byWorkspace['ws-B']).toBe('edited in B')
  })

  it('flush writes pending content for the target workspace only', async () => {
    await useNotesStore.getState().load('ws-A')
    useNotesStore.getState().setContent('ws-A', 'draft A')
    await useNotesStore.getState().flush('ws-A')
    expect(setMock).toHaveBeenCalledWith('ws-A', 'draft A')
    expect(setMock).toHaveBeenCalledTimes(1)
  })
})
