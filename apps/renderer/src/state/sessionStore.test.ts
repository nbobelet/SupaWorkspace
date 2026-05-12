import { beforeEach, describe, expect, it } from 'vitest'
import type { SessionState } from '@shared/session'
import {
  reorderScoped,
  scopeOrder,
  selectHighestPriorityTabId,
  useSessionStore,
  type RendererSession,
} from './sessionStore'

function s(id: string, workspaceId: string, state: SessionState = 'idle'): RendererSession {
  return {
    id,
    workspaceId,
    type: 'shell',
    label: id,
    state,
    hasUnseenWaiting: false,
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

  it('returns null when no session is urgent (only idle/running/finished)', () => {
    const sessions = {
      a: s('a', ws1, 'idle'),
      b: s('b', ws1, 'running'),
      c: s('c', ws1, 'finished'),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b', 'c'])).toBeNull()
  })

  it('picks error over waiting over running', () => {
    const sessions = {
      a: s('a', ws1, 'running'),
      b: s('b', ws1, 'waiting-for-input'),
      c: s('c', ws1, 'error'),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b', 'c'])).toBe('c')
  })

  it('picks waiting when there is no error', () => {
    const sessions = {
      a: s('a', ws1, 'running'),
      b: s('b', ws1, 'waiting-for-input'),
      c: s('c', ws1, 'idle'),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b', 'c'])).toBe('b')
  })

  it('breaks ties by leftmost (iteration order)', () => {
    const sessions = {
      a: s('a', ws1, 'waiting-for-input'),
      b: s('b', ws1, 'waiting-for-input'),
    }
    expect(selectHighestPriorityTabId(sessions, ['a', 'b'])).toBe('a')
    expect(selectHighestPriorityTabId(sessions, ['b', 'a'])).toBe('b')
  })

  it('ignores ids not present in sessions map', () => {
    const sessions = {
      a: s('a', ws1, 'error'),
    }
    expect(selectHighestPriorityTabId(sessions, ['ghost', 'a'])).toBe('a')
  })

  it('returns null for empty scoped order', () => {
    expect(selectHighestPriorityTabId({}, [])).toBeNull()
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
    // Only `b` (in ws2) remains, so the legacy global fallback is acceptable
    // here — but the workspace entry for ws1 must be cleared so PaneMosaic
    // renders <EmptyWorkspaceState> on switch back.
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
