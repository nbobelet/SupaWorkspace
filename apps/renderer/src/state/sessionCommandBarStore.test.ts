import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useSessionCommandBarStore } from './sessionCommandBarStore'

const writeMock = vi.fn().mockResolvedValue(undefined)
const submitMock = vi.fn().mockResolvedValue(undefined)
const appendMock = vi.fn()
const getMock = vi.fn().mockResolvedValue({ entries: [] })

beforeEach(() => {
  writeMock.mockClear()
  submitMock.mockClear()
  appendMock.mockReset()
  getMock.mockReset().mockResolvedValue({ entries: [] })
  ;(globalThis as unknown as { window: unknown }).window = {
    ws: {
      session: { write: writeMock, submit: submitMock },
      inputHistory: { append: appendMock, get: getMock },
    },
  }
  useSessionCommandBarStore.setState({
    value: '',
    history: [],
    historyIndex: null,
    loaded: false,
    visible: true,
  })
})

describe('sessionCommandBarStore — submit', () => {
  it('submits value via session.submit and appends to history', async () => {
    appendMock.mockResolvedValue({ entries: ['hello'] })
    useSessionCommandBarStore.getState().setValue('hello')
    await useSessionCommandBarStore.getState().submit('session-1')
    expect(submitMock).toHaveBeenCalledWith({ sessionId: 'session-1', data: 'hello' })
    expect(writeMock).not.toHaveBeenCalled()
    expect(appendMock).toHaveBeenCalledWith({ entry: 'hello' })
    const state = useSessionCommandBarStore.getState()
    expect(state.value).toBe('')
    expect(state.history).toEqual(['hello'])
  })

  it('no-op on empty value', async () => {
    await useSessionCommandBarStore.getState().submit('session-1')
    expect(submitMock).not.toHaveBeenCalled()
    expect(writeMock).not.toHaveBeenCalled()
    expect(appendMock).not.toHaveBeenCalled()
  })
})

describe('sessionCommandBarStore — history navigation', () => {
  it('historyPrev pulls last entry on first press', () => {
    useSessionCommandBarStore.setState({ history: ['a', 'b', 'c'], historyIndex: null, value: '' })
    useSessionCommandBarStore.getState().historyPrev()
    const state = useSessionCommandBarStore.getState()
    expect(state.value).toBe('c')
    expect(state.historyIndex).toBe(2)
  })

  it('historyPrev walks backwards through entries', () => {
    useSessionCommandBarStore.setState({ history: ['a', 'b', 'c'], historyIndex: null, value: '' })
    useSessionCommandBarStore.getState().historyPrev()
    useSessionCommandBarStore.getState().historyPrev()
    expect(useSessionCommandBarStore.getState().value).toBe('b')
    useSessionCommandBarStore.getState().historyPrev()
    expect(useSessionCommandBarStore.getState().value).toBe('a')
  })

  it('historyPrev caps at index 0', () => {
    useSessionCommandBarStore.setState({ history: ['only'], historyIndex: 0, value: 'only' })
    useSessionCommandBarStore.getState().historyPrev()
    expect(useSessionCommandBarStore.getState().value).toBe('only')
    expect(useSessionCommandBarStore.getState().historyIndex).toBe(0)
  })

  it('historyNext returns to empty value past last entry', () => {
    useSessionCommandBarStore.setState({ history: ['a', 'b'], historyIndex: 1, value: 'b' })
    useSessionCommandBarStore.getState().historyNext()
    const state = useSessionCommandBarStore.getState()
    expect(state.value).toBe('')
    expect(state.historyIndex).toBeNull()
  })

  it('historyNext is no-op when not navigating history', () => {
    useSessionCommandBarStore.setState({ history: ['a'], historyIndex: null, value: '' })
    useSessionCommandBarStore.getState().historyNext()
    const state = useSessionCommandBarStore.getState()
    expect(state.historyIndex).toBeNull()
    expect(state.value).toBe('')
  })

  it('setValue resets historyIndex (manual edit breaks navigation)', () => {
    useSessionCommandBarStore.setState({ history: ['a'], historyIndex: 0, value: 'a' })
    useSessionCommandBarStore.getState().setValue('axx')
    expect(useSessionCommandBarStore.getState().historyIndex).toBeNull()
  })
})

describe('sessionCommandBarStore — visibility', () => {
  it('toggleVisible flips the flag', () => {
    expect(useSessionCommandBarStore.getState().visible).toBe(true)
    useSessionCommandBarStore.getState().toggleVisible()
    expect(useSessionCommandBarStore.getState().visible).toBe(false)
    useSessionCommandBarStore.getState().toggleVisible()
    expect(useSessionCommandBarStore.getState().visible).toBe(true)
  })
})
