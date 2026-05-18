/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useTerminalSession', () => ({
  focusSession: vi.fn(),
}))

import { focusSession } from '../hooks/useTerminalSession'
import { useSessionStore } from '../state/sessionStore'
import { activateSession, focusIfSoleSession } from './sessionFocus'

// sessionFocus schedules focus on the next animation frame. Both Node and
// jsdom provide rAF (jsdom's is async-microtask-based and flushes
// unpredictably for our purposes); force a zero-delay setTimeout shim so
// `flushFrame()` deterministically drains pending focus callbacks.
globalThis.requestAnimationFrame = (cb: FrameRequestCallback): number => {
  setTimeout(() => cb(0), 0)
  return 0
}

const flushFrame = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

describe('activateSession (click-to-focus contract)', () => {
  beforeEach(() => {
    vi.mocked(focusSession).mockClear()
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
  })

  // Regression: clicking inside the already-active terminal pane must NOT
  // re-fire focusSession. focusSession -> follow.resync() -> scrollToBottom,
  // which destroys an in-flight selection and forces the viewport to the
  // newest output. Only a real session-switch should catch up to the bottom.
  it('skips focusSession when the clicked session is already active', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })
    store.setActive('s1')
    expect(useSessionStore.getState().activeId).toBe('s1')

    await activateSession('s1')
    await flushFrame()

    expect(focusSession).not.toHaveBeenCalled()
  })

  it('calls focusSession when activating a different session', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })
    store.addSession({
      id: 's2',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })
    store.setActive('s1')

    await activateSession('s2')
    await flushFrame()

    expect(focusSession).toHaveBeenCalledWith('s2')
  })
})

describe('focusIfSoleSession', () => {
  beforeEach(() => {
    vi.mocked(focusSession).mockClear()
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
    // Reset jsdom focus so an INPUT lingering from a prior test does not
    // poison the editable-element guard.
    if (typeof document !== 'undefined') {
      document.body.innerHTML = ''
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
  })

  it('focuses the sole non-pending session in the workspace', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })

    focusIfSoleSession('w1')
    expect(focusSession).not.toHaveBeenCalled()
    await flushFrame()
    expect(focusSession).toHaveBeenCalledWith('s1')
  })

  it('is a no-op when the workspace has zero sessions', async () => {
    focusIfSoleSession('w1')
    await flushFrame()
    expect(focusSession).not.toHaveBeenCalled()
  })

  it('is a no-op when the workspace has more than one non-pending session', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })
    store.addSession({
      id: 's2',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })

    focusIfSoleSession('w1')
    await flushFrame()
    expect(focusSession).not.toHaveBeenCalled()
  })

  it('ignores sessions from other workspaces when counting', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })
    store.addSession({
      id: 's2',
      workspaceId: 'w2',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })

    focusIfSoleSession('w1')
    await flushFrame()
    expect(focusSession).toHaveBeenCalledWith('s1')
  })

  it('is a no-op when the only session is a pending placeholder', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 'pending-1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
      pendingSpawn: true,
    })

    focusIfSoleSession('w1')
    await flushFrame()
    expect(focusSession).not.toHaveBeenCalled()
  })

  it('focuses the sole non-pending session even when sibling placeholders exist', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 'pending-1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
      pendingSpawn: true,
    })
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })

    focusIfSoleSession('w1')
    await flushFrame()
    expect(focusSession).toHaveBeenCalledWith('s1')
  })

  it('does not steal focus from an editable element outside xterm', async () => {
    const store = useSessionStore.getState()
    store.addSession({
      id: 's1',
      workspaceId: 'w1',
      type: 'shell',
      label: 'shell',
      state: 'idle',
    })

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    focusIfSoleSession('w1')
    await flushFrame()
    expect(focusSession).not.toHaveBeenCalled()
  })
})
