import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionState } from '@shared/session'
import {
  reorderScoped,
  scopeOrder,
  selectHighestPriorityTabId,
  useSessionStore,
  type RendererSession,
} from './sessionStore'

function s(
  id: string,
  workspaceId: string,
  state: SessionState = 'idle',
  exitCode: number | null = null,
): RendererSession {
  return {
    id,
    workspaceId,
    type: 'shell',
    label: id,
    state,
    exitCode,
    hasUnseenAsking: false,
    hasUnseenEnding: false,
    badgeCount: 0,
  }
}

describe('scopeOrder', () => {
  const ws1 = '550e8400-e29b-41d4-a716-446655440001'
  const ws2 = '550e8400-e29b-41d4-a716-446655440002'
  const sessions = {
    a: s('a', ws1),
    b: s('b', ws2),
    c: s('c', ws1),
    d: s('d', ws2),
  }
  const order = ['a', 'b', 'c', 'd']

  it('returns only sessions belonging to the active workspace, in order', () => {
    expect(scopeOrder(order, sessions, ws1)).toEqual(['a', 'c'])
    expect(scopeOrder(order, sessions, ws2)).toEqual(['b', 'd'])
  })

  it('returns empty array when workspaceId is null', () => {
    expect(scopeOrder(order, sessions, null)).toEqual([])
  })

  it('skips ids missing from sessions map', () => {
    const orderWithStale = ['a', 'ghost', 'c']
    expect(scopeOrder(orderWithStale, sessions, ws1)).toEqual(['a', 'c'])
  })

  it('returns empty array when no session matches the workspace', () => {
    const ws3 = '550e8400-e29b-41d4-a716-446655440003'
    expect(scopeOrder(order, sessions, ws3)).toEqual([])
  })
})

describe('reorderScoped', () => {
  const ws1 = 'ws1'
  const ws2 = 'ws2'
  const sessions = {
    a: s('a', ws1),
    b: s('b', ws2),
    c: s('c', ws1),
    d: s('d', ws2),
    e: s('e', ws1),
  }

  it('moves a scoped item from front to back without touching other-workspace items', () => {
    const order = ['a', 'b', 'c', 'd', 'e']
    expect(reorderScoped(order, sessions, ws1, 0, 2)).toEqual(['c', 'b', 'e', 'd', 'a'])
  })

  it('moves a scoped item one slot to the right', () => {
    const order = ['a', 'b', 'c', 'd', 'e']
    expect(reorderScoped(order, sessions, ws1, 0, 1)).toEqual(['c', 'b', 'a', 'd', 'e'])
  })

  it('keeps order intact when from equals to', () => {
    const order = ['a', 'b', 'c', 'd', 'e']
    expect(reorderScoped(order, sessions, ws1, 1, 1)).toEqual(order)
  })

  it('keeps order intact on out-of-bounds indices', () => {
    const order = ['a', 'b', 'c', 'd', 'e']
    expect(reorderScoped(order, sessions, ws1, -1, 2)).toEqual(order)
    expect(reorderScoped(order, sessions, ws1, 0, 99)).toEqual(order)
  })

  it('handles single-item scoped order', () => {
    const order = ['a', 'b']
    expect(reorderScoped(order, sessions, ws1, 0, 0)).toEqual(order)
  })
})

describe('selectHighestPriorityTabId', () => {
  const ws1 = 'ws1'

  it('returns null when no session is urgent (only idle/running/ending-ok)', () => {
    const sessions = {
      a: s('a', ws1, 'idle'),
      b: s('b', ws1, 'running'),
      c: s('c', ws1, 'ending', 0),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b', 'c'])).toBeNull()
  })

  it('picks error (ending with non-zero exitCode) over asking over running', () => {
    const sessions = {
      a: s('a', ws1, 'running'),
      b: s('b', ws1, 'asking'),
      c: s('c', ws1, 'ending', 1),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b', 'c'])).toBe('c')
  })

  it('picks asking when there is no error', () => {
    const sessions = {
      a: s('a', ws1, 'running'),
      b: s('b', ws1, 'asking'),
      c: s('c', ws1, 'idle'),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b', 'c'])).toBe('b')
  })

  it('breaks ties by leftmost (iteration order)', () => {
    const sessions = {
      a: s('a', ws1, 'asking'),
      b: s('b', ws1, 'asking'),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b'])).toBe('a')
    expect(selectHighestPriorityTabId(sessions, ['b', 'a'])).toBe('b')
  })

  it('ignores ids not present in sessions map', () => {
    const sessions = {
      a: s('a', ws1, 'ending', 1),
    }
    expect(selectHighestPriorityTabId(sessions, ['ghost', 'a'])).toBe('a')
  })

  it('returns null for empty scoped order', () => {
    expect(selectHighestPriorityTabId({}, [])).toBeNull()
  })
})

describe('setState attention flags', () => {
  const ws1 = '550e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
  })

  it('marks hasUnseenAsking when an inactive session transitions to asking', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws1))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().setState('b', 'asking')
    expect(useSessionStore.getState().sessions['b']?.hasUnseenAsking).toBe(true)
  })

  it('does not mark hasUnseenAsking when the active session transitions to asking', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().setState('a', 'asking')
    expect(useSessionStore.getState().sessions['a']?.hasUnseenAsking).toBe(false)
  })

  it('marks hasUnseenEnding with exitCode when an inactive session ends', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws1))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().setState('b', 'ending', 1)
    const b = useSessionStore.getState().sessions['b']
    expect(b?.hasUnseenEnding).toBe(true)
    expect(b?.state).toBe('ending')
    expect(b?.exitCode).toBe(1)
  })

  it('clears both attention flags on setActive', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws1))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().setState('b', 'asking')
    useSessionStore.getState().setState('b', 'ending', 0)
    useSessionStore.getState().setActive('b')
    const b = useSessionStore.getState().sessions['b']
    expect(b?.hasUnseenAsking).toBe(false)
    expect(b?.hasUnseenEnding).toBe(false)
  })
})

describe('activeByWorkspace tracking', () => {
  const ws1 = '550e8400-e29b-41d4-a716-446655440001'
  const ws2 = '550e8400-e29b-41d4-a716-446655440002'

  beforeEach(() => {
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
  })

  it('records first session per workspace on add', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws1))
    useSessionStore.getState().addSession(s('c', ws2))
    const map = useSessionStore.getState().activeByWorkspace
    expect(map[ws1]).toBe('a')
    expect(map[ws2]).toBe('c')
  })

  it('updates activeByWorkspace on setActive for the matching workspace', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws1))
    useSessionStore.getState().setActive('b')
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBe('b')
  })

  it('falls back to next session in same workspace when active one is removed', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws1))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().removeSession('a')
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBe('b')
  })

  it('drops the workspace entry entirely when its last session is removed', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().removeSession('a')
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBeUndefined()
  })

  it('does not affect other workspaces when one workspace changes active', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws2))
    useSessionStore.getState().addSession(s('c', ws2))
    useSessionStore.getState().setActive('c')
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBe('a')
    expect(useSessionStore.getState().activeByWorkspace[ws2]).toBe('c')
  })

  it('does not jump activeId across workspaces when the last session of a workspace is removed', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws2))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().removeSession('a')
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBeUndefined()
  })

  it('prefers a same-workspace sibling over an other-workspace session for activeId fallback', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    useSessionStore.getState().addSession(s('b', ws2))
    useSessionStore.getState().addSession(s('c', ws1))
    useSessionStore.getState().setActive('a')
    useSessionStore.getState().removeSession('a')
    expect(useSessionStore.getState().activeId).toBe('c')
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBe('c')
    expect(useSessionStore.getState().activeByWorkspace[ws2]).toBe('b')
  })
})

// Regression: EmptyWorkspaceState used to leave snapshot placeholders
// hanging in the sidebar when the user picked "New Shell" / "New Claude"
// over "Restore previous". The store now exposes
// `removePendingForWorkspace` so the prompt can throw the old set out
// before spawning a fresh PTY.
describe('removePendingForWorkspace', () => {
  const ws1 = '550e8400-e29b-41d4-a716-446655440001'
  const ws2 = '550e8400-e29b-41d4-a716-446655440002'

  beforeEach(() => {
    useSessionStore.setState({
      sessions: {},
      order: [],
      activeId: null,
      activeByWorkspace: {},
      lastUsedType: 'shell',
    })
  })

  function addPending(id: string, workspaceId: string): void {
    useSessionStore
      .getState()
      .addSession({ ...s(id, workspaceId), pendingSpawn: true })
  }

  it('removes only pending placeholders for the given workspace', () => {
    addPending('a', ws1)
    addPending('b', ws1)
    useSessionStore.getState().addSession(s('c', ws1)) // real (no pendingSpawn)
    addPending('d', ws2)

    useSessionStore.getState().removePendingForWorkspace(ws1)

    const state = useSessionStore.getState()
    expect(Object.keys(state.sessions).sort()).toEqual(['c', 'd'])
    expect(state.order).toEqual(['c', 'd'])
  })

  it('is a no-op when the workspace has no pending placeholders', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    const before = useSessionStore.getState().sessions
    useSessionStore.getState().removePendingForWorkspace(ws1)
    expect(useSessionStore.getState().sessions).toBe(before)
  })

  it('clears activeByWorkspace[ws] when it pointed at a removed placeholder', () => {
    addPending('a', ws1)
    addPending('b', ws2)
    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBe('a')

    useSessionStore.getState().removePendingForWorkspace(ws1)

    expect(useSessionStore.getState().activeByWorkspace[ws1]).toBeUndefined()
    expect(useSessionStore.getState().activeByWorkspace[ws2]).toBe('b')
  })

  it('clears activeId when it pointed at a removed placeholder', () => {
    addPending('a', ws1)
    useSessionStore.getState().setActive('a')
    expect(useSessionStore.getState().activeId).toBe('a')

    useSessionStore.getState().removePendingForWorkspace(ws1)

    expect(useSessionStore.getState().activeId).toBeNull()
  })

  it('preserves activeId when it points at a real (non-pending) session', () => {
    useSessionStore.getState().addSession(s('a', ws1))
    addPending('b', ws1)
    useSessionStore.getState().setActive('a')

    useSessionStore.getState().removePendingForWorkspace(ws1)

    expect(useSessionStore.getState().activeId).toBe('a')
  })
})
