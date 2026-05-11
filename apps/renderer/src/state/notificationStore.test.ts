import { beforeEach, describe, expect, it } from 'vitest'
import {
  recentByWorkspace,
  unreadCountByWorkspace,
  useNotificationStore,
  type RendererNotification,
} from './notificationStore'

const ws1 = '550e8400-e29b-41d4-a716-446655440001'
const ws2 = '550e8400-e29b-41d4-a716-446655440002'

function makeNotif(overrides: Partial<RendererNotification> = {}): Omit<RendererNotification, 'read'> {
  return {
    id: overrides.id ?? '550e8400-e29b-41d4-a716-000000000001',
    workspaceId: overrides.workspaceId ?? ws1,
    sessionId: overrides.sessionId ?? '550e8400-e29b-41d4-a716-000000000010',
    sessionLabel: overrides.sessionLabel ?? 'pwsh',
    workspaceName: overrides.workspaceName ?? 'ws-1',
    kind: overrides.kind ?? 'waiting',
    ts: overrides.ts ?? 1_700_000_000_000,
  }
}

describe('notificationStore', () => {
  beforeEach(() => {
    useNotificationStore.setState({ notifications: [] })
  })

  it('pushes a notification with read = false at the top', () => {
    useNotificationStore.getState().push(makeNotif({ id: 'n-1' }))
    useNotificationStore.getState().push(makeNotif({ id: 'n-2' }))
    const state = useNotificationStore.getState().notifications
    expect(state).toHaveLength(2)
    expect(state[0]?.id).toBe('n-2')
    expect(state[0]?.read).toBe(false)
  })

  it('marks a single notification as read', () => {
    useNotificationStore.getState().push(makeNotif({ id: 'n-1' }))
    useNotificationStore.getState().push(makeNotif({ id: 'n-2' }))
    useNotificationStore.getState().markRead('n-2')
    const state = useNotificationStore.getState().notifications
    expect(state.find((n) => n.id === 'n-2')?.read).toBe(true)
    expect(state.find((n) => n.id === 'n-1')?.read).toBe(false)
  })

  it('marks all notifications for a workspace as read', () => {
    useNotificationStore.getState().push(makeNotif({ id: 'n-1', workspaceId: ws1 }))
    useNotificationStore.getState().push(makeNotif({ id: 'n-2', workspaceId: ws1 }))
    useNotificationStore.getState().push(makeNotif({ id: 'n-3', workspaceId: ws2 }))
    useNotificationStore.getState().markAllReadForWorkspace(ws1)
    const state = useNotificationStore.getState().notifications
    expect(unreadCountByWorkspace(state, ws1)).toBe(0)
    expect(unreadCountByWorkspace(state, ws2)).toBe(1)
  })

  it('clears a notification by id', () => {
    useNotificationStore.getState().push(makeNotif({ id: 'n-1' }))
    useNotificationStore.getState().push(makeNotif({ id: 'n-2' }))
    useNotificationStore.getState().clear('n-1')
    expect(useNotificationStore.getState().notifications).toHaveLength(1)
  })

  it('unreadCountByWorkspace counts only unread for that workspace', () => {
    useNotificationStore.getState().push(makeNotif({ id: 'a', workspaceId: ws1 }))
    useNotificationStore.getState().push(makeNotif({ id: 'b', workspaceId: ws1 }))
    useNotificationStore.getState().push(makeNotif({ id: 'c', workspaceId: ws2 }))
    useNotificationStore.getState().markRead('a')
    const state = useNotificationStore.getState().notifications
    expect(unreadCountByWorkspace(state, ws1)).toBe(1)
    expect(unreadCountByWorkspace(state, ws2)).toBe(1)
  })

  it('recentByWorkspace returns only matching workspace, respecting limit', () => {
    for (let i = 0; i < 5; i += 1) {
      useNotificationStore.getState().push(makeNotif({ id: `a-${i}`, workspaceId: ws1 }))
    }
    useNotificationStore.getState().push(makeNotif({ id: 'b-0', workspaceId: ws2 }))
    const state = useNotificationStore.getState().notifications
    expect(recentByWorkspace(state, ws1, 3)).toHaveLength(3)
    expect(recentByWorkspace(state, ws2)).toHaveLength(1)
  })
})
