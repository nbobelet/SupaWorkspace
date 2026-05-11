import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotesStore } from './notesStore'
import { useWorkspaceStore } from './workspaceStore'

describe('notesStore', () => {
  const setMock = vi.fn(async (_content: string) => undefined)
  const getMock = vi.fn(async () => ({ content: 'hello from disk' }))

  beforeEach(() => {
    setMock.mockClear()
    getMock.mockClear()
    ;(globalThis as { window?: unknown }).window = {
      ws: { notes: { get: getMock, set: setMock } },
    }
    useNotesStore.setState({ content: '', loaded: false })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loads content from disk once', async () => {
    await useNotesStore.getState().load()
    expect(useNotesStore.getState().content).toBe('hello from disk')
    expect(useNotesStore.getState().loaded).toBe(true)
    expect(getMock).toHaveBeenCalledTimes(1)

    await useNotesStore.getState().load()
    expect(getMock).toHaveBeenCalledTimes(1)
  })

  it('persists notes globally — content survives workspace switching', async () => {
    await useNotesStore.getState().load()
    useNotesStore.getState().setContent('user typed something')
    expect(useNotesStore.getState().content).toBe('user typed something')

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-A' })
    expect(useNotesStore.getState().content).toBe('user typed something')

    useWorkspaceStore.setState({ activeWorkspaceId: 'ws-B' })
    expect(useNotesStore.getState().content).toBe('user typed something')
  })

  it('flush writes pending content synchronously', async () => {
    await useNotesStore.getState().load()
    useNotesStore.getState().setContent('draft')
    await useNotesStore.getState().flush()
    expect(setMock).toHaveBeenCalledWith('draft')
  })
})
