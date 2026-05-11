import { describe, expect, it } from 'vitest'
import { scopeOrder, type RendererSession } from './sessionStore'

function s(id: string, workspaceId: string): RendererSession {
  return {
    id,
    workspaceId,
    type: 'shell',
    label: id,
    state: 'idle',
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
