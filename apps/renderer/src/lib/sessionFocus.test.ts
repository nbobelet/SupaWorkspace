/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../hooks/useTerminalSession', () => ({
  focusSession: vi.fn(),
  resyncSession: vi.fn(),
}))

import { focusSession, resyncSession } from '../hooks/useTerminalSession'
import { useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import {
  activateSession,
  focusActiveSession,
  focusIfSoleSession,
  jumpToSession,
  jumpToWorkspace,
} from './sessionFocus'

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
    vi.mocked(resyncSession).mockClear()
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
  })

  // Regression: clicking inside the already-active terminal pane must NOT
  // re-fire focusSession OR resyncSession. resyncSession -> scrollToBottom,
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
    expect(resyncSession).not.toHaveBeenCalled()
  })

  // After the TerminalPane-owned focus refactor, activateSession only marks
  // the new session active — focus is fired by TerminalPane.useEffect once
  // the new pane is mounted with isActive=true. This test pins the new
  // contract: setActive flips, focusSession is NOT called from here.
  it('flips activeId and lets TerminalPane own the focus call', async () => {
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

    expect(useSessionStore.getState().activeId).toBe('s2')
    expect(focusSession).not.toHaveBeenCalled()
  })
})

describe('focusIfSoleSession', () => {
  beforeEach(() => {
    vi.mocked(focusSession).mockClear()
    vi.mocked(resyncSession).mockClear()
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

describe('focusActiveSession (TerminalPane-owned focus on activation)', () => {
  beforeEach(() => {
    vi.mocked(focusSession).mockClear()
    vi.mocked(resyncSession).mockClear()
    if (typeof document !== 'undefined') {
      document.body.innerHTML = ''
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
  })

  // Regression: switching tab / workspace / Ctrl+Tab / Ctrl+1-9 must leave
  // the new pane's xterm ready to receive keystrokes, no extra click. Pane
  // owns the focus call so it fires after React commits the new tree and
  // `useTerminalSession` re-attaches `handle.element` — a single rAF in
  // App.tsx fired too early and landed `term.focus()` on a detached node.
  it('focuses the session on the next animation frame', async () => {
    focusActiveSession('s1')
    expect(focusSession).not.toHaveBeenCalled()
    await flushFrame()
    expect(focusSession).toHaveBeenCalledWith('s1')
  })

  it('is a no-op when an editable element outside xterm has focus', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    focusActiveSession('s1')
    await flushFrame()
    expect(focusSession).not.toHaveBeenCalled()
  })

  // Editable guard is re-checked inside the rAF: an input focused AFTER the
  // pane scheduled its focus call must still win. Prevents stealing focus
  // from a rename input that opens between activation and the next frame.
  it('is a no-op when an editable element is focused before the frame fires', async () => {
    focusActiveSession('s1')
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    await flushFrame()
    expect(focusSession).not.toHaveBeenCalled()
  })

  it('still focuses when the active element is inside xterm', async () => {
    const xtermRoot = document.createElement('div')
    xtermRoot.className = 'xterm'
    const inner = document.createElement('textarea')
    xtermRoot.appendChild(inner)
    document.body.appendChild(xtermRoot)
    inner.focus()
    expect(document.activeElement).toBe(inner)

    focusActiveSession('s1')
    await flushFrame()
    expect(focusSession).toHaveBeenCalledWith('s1')
  })

  // Regression for scroll-bottom-on-tab-activate: resync (scroll to bottom)
  // and focus-steal must be decoupled. An editable input outside xterm
  // (rename field, search) blocks the term.focus() steal, but the viewport
  // must still snap to bottom on tab activate — otherwise the scrollbar
  // sits at the top of the scrollback while the cursor is at the buffer's
  // bottom, and wheel-scroll jumps to the old position.
  it('resyncSession fires on tab activate even when an editable input outside xterm has focus', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    focusActiveSession('s1')
    await flushFrame()

    expect(resyncSession).toHaveBeenCalledTimes(1)
    expect(resyncSession).toHaveBeenCalledWith('s1')
    expect(focusSession).not.toHaveBeenCalled()
  })

  // Pairs with the test above: focus-steal stays guarded against an
  // editable element outside xterm. The two responsibilities of
  // focusActiveSession (resync, focus-steal) are now independent.
  it('focusActiveSession does NOT call focusSession when an editable input outside xterm has focus', async () => {
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    focusActiveSession('s1')
    await flushFrame()

    expect(focusSession).not.toHaveBeenCalled()
  })
})

describe('jumpToSession (cross-workspace click-to-jump)', () => {
  beforeEach(() => {
    vi.mocked(focusSession).mockClear()
    vi.mocked(resyncSession).mockClear()
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null })
  })

  // Regression: clicking a sidebar accordion session that belongs to a
  // different workspace must switch the visible workspace too — without
  // this, setActive() flips the session-store activeId while the visible
  // workspace stays put, leaving the click on a hidden TerminalPane.
  it('switches workspace when the target session belongs to another workspace', async () => {
    const store = useSessionStore.getState()
    store.addSession({ id: 's1', workspaceId: 'w1', type: 'shell', label: 's1', state: 'idle' })
    store.addSession({ id: 's2', workspaceId: 'w2', type: 'shell', label: 's2', state: 'idle' })
    store.setActive('s1')
    useWorkspaceStore.setState({ activeWorkspaceId: 'w1' })

    await jumpToSession('s2')

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('w2')
    expect(useSessionStore.getState().activeId).toBe('s2')
  })

  it('does not touch workspace when the target session is in the active workspace', async () => {
    const store = useSessionStore.getState()
    store.addSession({ id: 's1', workspaceId: 'w1', type: 'shell', label: 's1', state: 'idle' })
    store.addSession({ id: 's2', workspaceId: 'w1', type: 'shell', label: 's2', state: 'idle' })
    store.setActive('s1')
    useWorkspaceStore.setState({ activeWorkspaceId: 'w1' })

    await jumpToSession('s2')

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('w1')
    expect(useSessionStore.getState().activeId).toBe('s2')
  })

  it('is a no-op when the session id is unknown', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'w1' })

    await jumpToSession('ghost')

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('w1')
    expect(useSessionStore.getState().activeId).toBeNull()
  })
})

describe('jumpToWorkspace (tile click-to-jump)', () => {
  beforeEach(() => {
    vi.mocked(focusSession).mockClear()
    vi.mocked(resyncSession).mockClear()
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
    useWorkspaceStore.setState({ workspaces: [], activeWorkspaceId: null })
    if (typeof document !== 'undefined') {
      document.body.innerHTML = ''
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    }
  })

  // Cross-workspace tile click: defer focus to App.tsx's workspace-switch
  // effect, which picks the remembered active session and TerminalPane
  // self-focuses on isActive flip. This helper only flips the workspace id.
  it('flips active workspace when target is different, without re-firing focus', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'w1' })

    jumpToWorkspace('w2')
    await flushFrame()

    expect(useWorkspaceStore.getState().activeWorkspaceId).toBe('w2')
    expect(focusSession).not.toHaveBeenCalled()
  })

  // Same-workspace tile click: no state diff would trigger the App.tsx
  // workspace-switch effect, so re-focus the remembered active session
  // directly. Without this, clicking the already-active tile leaves the
  // terminal cursor wherever it was (e.g. lost to the sidebar button).
  it('re-focuses the remembered active session when the workspace is already active', async () => {
    const store = useSessionStore.getState()
    store.addSession({ id: 's1', workspaceId: 'w1', type: 'shell', label: 's1', state: 'idle' })
    store.setActive('s1')
    useWorkspaceStore.setState({ activeWorkspaceId: 'w1' })

    jumpToWorkspace('w1')
    await flushFrame()

    expect(focusSession).toHaveBeenCalledWith('s1')
  })

  it('is a no-op on same-workspace click when no session is remembered', async () => {
    useWorkspaceStore.setState({ activeWorkspaceId: 'w1' })

    jumpToWorkspace('w1')
    await flushFrame()

    expect(focusSession).not.toHaveBeenCalled()
  })
})
