import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Electron isn't loaded in vitest's node environment, so we stub the
// `Notification` constructor's static API and `isSupported`. Captured
// instances expose the title each test asserts on.
const showSpy = vi.fn()
const notificationInstances: { title: string; body?: string }[] = []

vi.mock('electron', () => {
  class FakeNotification {
    title: string
    body?: string
    private listeners: Record<string, (() => void)[]> = {}
    constructor(opts: { title: string; body?: string }) {
      this.title = opts.title
      this.body = opts.body
      notificationInstances.push({ title: this.title, body: this.body })
    }
    on(event: string, cb: () => void): this {
      ;(this.listeners[event] ??= []).push(cb)
      return this
    }
    show(): void {
      showSpy()
    }
    static isSupported(): boolean {
      return true
    }
  }
  return { Notification: FakeNotification }
})

import type { BrowserWindow } from 'electron'
import type { SessionConfig } from '@shared/session'
import type { NotificationPushEvent } from '@shared/notification'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'
import { Notifier } from './Notifier'

function makeSession(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    workspaceId: '22222222-2222-2222-2222-222222222222',
    type: 'shell',
    label: 'pwsh',
    cwd: 'C:/repo',
    createdAt: 0,
    ...overrides,
  }
}

function setup(opts: { focused?: boolean } = {}): {
  notifier: Notifier
  pushed: NotificationPushEvent[]
  advance: (ms: number) => void
} {
  let clock = 0
  const advance = (ms: number): void => {
    clock += ms
  }
  const pushed: NotificationPushEvent[] = []
  const win = {
    isFocused: () => opts.focused ?? false,
    isMinimized: () => false,
    isDestroyed: () => false,
    webContents: {
      send: (channel: string, payload: unknown) => {
        if (channel === 'notif:push') pushed.push(payload as NotificationPushEvent)
      },
    },
  } as unknown as BrowserWindow
  const workspaceStore = {
    getById: (id: string) => ({
      id,
      name: 'workspace-a',
      rootPath: '',
      hue: 0,
      createdAt: 0,
    }),
  } as unknown as WorkspaceStore
  const notifier = new Notifier(() => win, workspaceStore, () => clock)
  return { notifier, pushed, advance }
}

describe('Notifier — running → idle (request-complete)', () => {
  beforeEach(() => {
    showSpy.mockClear()
    notificationInstances.length = 0
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('emits request-complete when user typed during a running phase ≥ 1500ms', () => {
    const { notifier, pushed, advance } = setup({ focused: false })
    const session = makeSession()
    notifier.registerSession(session)

    notifier.markUserInput(session.id)
    notifier.handleStateChange(session.id, 'running')
    advance(2000)
    notifier.handleStateChange(session.id, 'idle')

    const completes = pushed.filter((p) => p.kind === 'request-complete')
    expect(completes).toHaveLength(1)
    expect(completes[0]?.sessionLabel).toBe('pwsh')
    expect(completes[0]?.workspaceName).toBe('workspace-a')
    expect(notificationInstances).toEqual([{ title: 'workspace-a - pwsh : done', body: undefined }])
    expect(showSpy).toHaveBeenCalledTimes(1)
  })

  it('skips request-complete when no user input preceded the running phase (Claude TUI flap)', () => {
    const { notifier, pushed, advance } = setup({ focused: false })
    const session = makeSession({ type: 'claude', label: 'claude' })
    notifier.registerSession(session)

    // No markUserInput — simulates cursor-blink data triggering running.
    notifier.handleStateChange(session.id, 'running')
    advance(2000)
    notifier.handleStateChange(session.id, 'idle')

    expect(pushed.filter((p) => p.kind === 'request-complete')).toHaveLength(0)
    expect(showSpy).not.toHaveBeenCalled()
  })

  it('skips request-complete when running phase < 1500ms (short shell commands)', () => {
    const { notifier, pushed, advance } = setup({ focused: false })
    const session = makeSession()
    notifier.registerSession(session)

    notifier.markUserInput(session.id)
    notifier.handleStateChange(session.id, 'running')
    advance(500)
    notifier.handleStateChange(session.id, 'idle')

    expect(pushed.filter((p) => p.kind === 'request-complete')).toHaveLength(0)
    expect(showSpy).not.toHaveBeenCalled()
  })

  it('skips OS toast when window is focused (in-app sinks still receive the push)', () => {
    const { notifier, pushed, advance } = setup({ focused: true })
    const session = makeSession()
    notifier.registerSession(session)

    notifier.markUserInput(session.id)
    notifier.handleStateChange(session.id, 'running')
    advance(2000)
    notifier.handleStateChange(session.id, 'idle')

    expect(pushed.filter((p) => p.kind === 'request-complete')).toHaveLength(1)
    expect(showSpy).not.toHaveBeenCalled()
  })

  it('resets the input flag after each notification (next phase must re-mark)', () => {
    const { notifier, pushed, advance } = setup({ focused: false })
    const session = makeSession()
    notifier.registerSession(session)

    notifier.markUserInput(session.id)
    notifier.handleStateChange(session.id, 'running')
    advance(2000)
    notifier.handleStateChange(session.id, 'idle')
    expect(pushed.filter((p) => p.kind === 'request-complete')).toHaveLength(1)

    // Second running phase WITHOUT a new markUserInput — must not fire again.
    notifier.handleStateChange(session.id, 'running')
    advance(2000)
    notifier.handleStateChange(session.id, 'idle')
    expect(pushed.filter((p) => p.kind === 'request-complete')).toHaveLength(1)
  })

  it('asking transition uses the same `{workspace} - {label} : status` format', () => {
    const { notifier } = setup({ focused: false })
    const session = makeSession({ label: 'claude' })
    notifier.registerSession(session)

    notifier.handleStateChange(session.id, 'asking')

    expect(notificationInstances).toEqual([{ title: 'workspace-a - claude : input needed', body: undefined }])
  })

  it('non-zero exit reports the code in the consistent title format', () => {
    const { notifier } = setup({ focused: false })
    const session = makeSession()
    notifier.registerSession(session)

    notifier.handleStateChange(session.id, 'running')
    notifier.handleStateChange(session.id, 'ending', 137)

    expect(notificationInstances).toEqual([{ title: 'workspace-a - pwsh : exited 137', body: undefined }])
  })
})
