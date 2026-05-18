import { describe, expect, it } from 'vitest'
import type { NotificationPushEvent } from '@shared/notification'
import { shouldSuppressDoneToast } from './suppressDoneToast'

function makeEvent(
  kind: NotificationPushEvent['kind'],
  sessionId: string | undefined,
): NotificationPushEvent {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    workspaceId: '00000000-0000-0000-0000-000000000002',
    workspaceName: 'ws',
    kind,
    ts: 0,
    ...(sessionId ? { sessionId } : {}),
  }
}

describe('shouldSuppressDoneToast', () => {
  const SID = '00000000-0000-0000-0000-000000000aaa'
  const OTHER = '00000000-0000-0000-0000-000000000bbb'

  it('suppresses request-complete on the active session when window focused', () => {
    expect(shouldSuppressDoneToast(makeEvent('request-complete', SID), SID, true)).toBe(true)
  })

  it('does NOT suppress when window is unfocused (user might not see terminal)', () => {
    expect(shouldSuppressDoneToast(makeEvent('request-complete', SID), SID, false)).toBe(false)
  })

  it('does NOT suppress when the active session is a different tab', () => {
    expect(shouldSuppressDoneToast(makeEvent('request-complete', SID), OTHER, true)).toBe(false)
  })

  it('does NOT suppress when there is no active session at all', () => {
    expect(shouldSuppressDoneToast(makeEvent('request-complete', SID), null, true)).toBe(false)
  })

  it('does NOT suppress user-input-required (asking needs visibility regardless)', () => {
    expect(shouldSuppressDoneToast(makeEvent('user-input-required', SID), SID, true)).toBe(false)
  })

  it('does NOT suppress permission-prompt (must always toast)', () => {
    expect(shouldSuppressDoneToast(makeEvent('permission-prompt', SID), SID, true)).toBe(false)
  })

  it('does NOT suppress error (must always toast)', () => {
    expect(shouldSuppressDoneToast(makeEvent('error', SID), SID, true)).toBe(false)
  })

  it('does NOT suppress when sessionId is missing on the event', () => {
    expect(shouldSuppressDoneToast(makeEvent('request-complete', undefined), SID, true)).toBe(false)
  })
})
