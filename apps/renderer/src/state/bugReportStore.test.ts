import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useBugReportStore, DEFAULT_DRAFT } from './bugReportStore'

describe('bugReportStore', () => {
  const createMock = vi.fn()
  const listMock = vi.fn(async () => ({ reports: [] }))
  const revealMock = vi.fn(async () => undefined)

  beforeEach(() => {
    createMock.mockReset()
    listMock.mockClear()
    revealMock.mockClear()
    ;(globalThis as { window?: unknown }).window = {
      ws: { bugReport: { create: createMock, list: listMock, revealDir: revealMock } },
    }
    useBugReportStore.setState({
      isOpen: false,
      draft: { ...DEFAULT_DRAFT },
      isSubmitting: false,
      lastError: null,
    })
  })

  it('open/close toggle visibility and clear lastError', () => {
    useBugReportStore.setState({ lastError: 'stale' })
    useBugReportStore.getState().open()
    expect(useBugReportStore.getState().isOpen).toBe(true)
    expect(useBugReportStore.getState().lastError).toBeNull()

    useBugReportStore.getState().close()
    expect(useBugReportStore.getState().isOpen).toBe(false)
  })

  it('updateDraft merges partial patches', () => {
    useBugReportStore.getState().updateDraft({ title: 'Crash' })
    useBugReportStore.getState().updateDraft({ severity: 'high' })
    const draft = useBugReportStore.getState().draft
    expect(draft.title).toBe('Crash')
    expect(draft.severity).toBe('high')
    expect(draft.description).toBe('')
  })

  it('submit happy path calls window.ws.bugReport.create, resets draft, closes', async () => {
    createMock.mockResolvedValueOnce({ id: 'abc', path: '/tmp/bug.md' })
    useBugReportStore.getState().open()
    useBugReportStore.getState().updateDraft({
      title: '  Tabs lose focus  ',
      description: 'desc',
      steps_to_reproduce: '  click  ',
    })

    const res = await useBugReportStore.getState().submit()

    expect(res).toEqual({ id: 'abc', path: '/tmp/bug.md' })
    expect(createMock).toHaveBeenCalledWith({
      title: 'Tabs lose focus',
      severity: 'medium',
      description: 'desc',
      steps_to_reproduce: 'click',
      expected_behavior: undefined,
      actual_behavior: undefined,
    })
    const state = useBugReportStore.getState()
    expect(state.isOpen).toBe(false)
    expect(state.isSubmitting).toBe(false)
    expect(state.draft).toEqual(DEFAULT_DRAFT)
    expect(state.lastError).toBeNull()
  })

  it('submit failure sets lastError and leaves dialog open', async () => {
    createMock.mockRejectedValueOnce(new Error('disk full'))
    useBugReportStore.getState().open()
    useBugReportStore.getState().updateDraft({ title: 'x', description: 'y' })

    const res = await useBugReportStore.getState().submit()

    expect(res).toBeNull()
    const state = useBugReportStore.getState()
    expect(state.isOpen).toBe(true)
    expect(state.isSubmitting).toBe(false)
    expect(state.lastError).toBe('disk full')
    expect(state.draft.title).toBe('x')
  })
})
