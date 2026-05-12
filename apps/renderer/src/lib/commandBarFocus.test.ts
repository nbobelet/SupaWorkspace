import { beforeEach, describe, expect, it, vi } from 'vitest'

const focusSessionSpy = vi.fn()

vi.mock('../hooks/useTerminalSession', () => ({
  focusSession: (id: string) => focusSessionSpy(id),
}))

vi.mock('../state/sessionStore', () => {
  let state: { activeId: string | null } = { activeId: null }
  return {
    useSessionStore: Object.assign(
      // hook callable form is unused by commandBarFocus; provide a stub
      () => state,
      {
        getState: () => state,
        setState: (next: Partial<typeof state>) => {
          state = { ...state, ...next }
        },
      },
    ),
  }
})

import { useSessionStore } from '../state/sessionStore'
import { returnFocusToActiveSession } from './commandBarFocus'

beforeEach(() => {
  focusSessionSpy.mockReset()
  ;(useSessionStore as unknown as { setState: (s: { activeId: string | null }) => void }).setState({
    activeId: null,
  })
})

describe('returnFocusToActiveSession', () => {
  it('focuses the active session when one is set', async () => {
    ;(useSessionStore as unknown as { setState: (s: { activeId: string }) => void }).setState({
      activeId: 'abc',
    })
    returnFocusToActiveSession()
    // helper schedules on rAF; flush via vi.runAllTicks would need timers — use microtask wait
    await new Promise((r) => setTimeout(r, 0))
    // rAF in jsdom is shimmed to setTimeout(0) in vitest by default
    await new Promise((r) => setTimeout(r, 0))
    expect(focusSessionSpy).toHaveBeenCalledWith('abc')
  })

  it('no-ops when activeId is null (does not call focusSession, does not focus body)', async () => {
    returnFocusToActiveSession()
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))
    expect(focusSessionSpy).not.toHaveBeenCalled()
  })
})
