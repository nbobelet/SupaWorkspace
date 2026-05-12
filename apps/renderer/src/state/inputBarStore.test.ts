import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInputBarStore } from './inputBarStore'

const writeMock = vi.fn().mockResolvedValue(undefined)
const appendMock = vi.fn()
const getMock = vi.fn().mockResolvedValue({ entries: [] })

beforeEach(() => {
  writeMock.mockClear()
  appendMock.mockReset()
  getMock.mockReset().mockResolvedValue({ entries: [] })
  ;(globalThis as unknown as { window: unknown }).window = {
    ws: {
      session: { write: writeMock },
      inputHistory: { append: appendMock, get: getMock },
    },
  }
  useInputBarStore.setState({
    value: '',
    history: [],
    historyIndex: null,
    loaded: false,
    visible: true,
  })
})

describe('inputBarStore — submit', () => {
  it('writes value+CR to active session and appends to history', async () => {
    appendMock.mockResolvedValue({ entries: ['hello'] })
    useInputBarStore.getState().setValue('hello')
    await useInputBarStore.getState().submit('session-1')
    expect(writeMock).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'hello\r' })
    expect(appendMock).toHaveBeenCalledWith({ entry: 'hello' })
    const state = useInputBarStore.getState()
    expect(state.value).toBe('')
    expect(state.history).toEqual(['hello'])
  })

  it('no-op on empty value', async () => {
    await useInputBarStore.getState().submit('session-1')
    expect(writeMock).not.toHaveBeenCalled()
    expect(appendMock).not.toHaveBeenCalled()
  })
})

describe('inputBarStore — history navigation', () => {
  it('historyPrev pulls last entry on first press', () => {
    useInputBarStore.setState({ history: ['a', 'b', 'c'], historyIndex: null, value: '' })
    useInputBarStore.getState().historyPrev()
    const state = useInputBarStore.getState()
    expect(state.value).toBe('c')
    expect(state.historyIndex).toBe(2)
  })

  it('historyPrev walks backwards through entries', () => {
    useInputBarStore.setState({ history: ['a', 'b', 'c'], historyIndex: null, value: '' })
    useInputBarStore.getState().historyPrev()
    useInputBarStore.getState().historyPrev()
    expect(useInputBarStore.getState().value).toBe('b')
    useInputBarStore.getState().historyPrev()
    expect(useInputBarStore.getState().value).toBe('a')
  })

  it('historyPrev caps at index 0', () => {
    useInputBarStore.setState({ history: ['only'], historyIndex: 0, value: 'only' })
    useInputBarStore.getState().historyPrev()
    expect(useInputBarStore.getState().value).toBe('only')
    expect(useInputBarStore.getState().historyIndex).toBe(0)
  })

  it('historyNext returns to empty value past last entry', () => {
    useInputBarStore.setState({ history: ['a', 'b'], historyIndex: 1, value: 'b' })
    useInputBarStore.getState().historyNext()
    const state = useInputBarStore.getState()
    expect(state.value).toBe('')
    expect(state.historyIndex).toBeNull()
  })

  it('historyNext is no-op when not navigating history', () => {
    useInputBarStore.setState({ history: ['a'], historyIndex: null, value: '' })
    useInputBarStore.getState().historyNext()
    const state = useInputBarStore.getState()
    expect(state.historyIndex).toBeNull()
    expect(state.value).toBe('')
  })

  it('setValue resets historyIndex (manual edit breaks navigation)', () => {
    useInputBarStore.setState({ history: ['a'], historyIndex: 0, value: 'a' })
    useInputBarStore.getState().setValue('axx')
    expect(useInputBarStore.getState().historyIndex).toBeNull()
  })
})

describe('inputBarStore — visibility', () => {
  it('toggleVisible flips the flag', () => {
    expect(useInputBarStore.getState().visible).toBe(true)
    useInputBarStore.getState().toggleVisible()
    expect(useInputBarStore.getState().visible).toBe(false)
    useInputBarStore.getState().toggleVisible()
    expect(useInputBarStore.getState().visible).toBe(true)
  })
})
