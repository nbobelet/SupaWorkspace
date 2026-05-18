import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { Notification } from 'electron'
import type { SessionConfig, SessionState } from '@shared/session'
import { IpcChannel } from '@shared/ipc'
import type { NotificationKind, NotificationPushEvent } from '@shared/notification'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'

// Minimum `running` duration before a running→idle transition fires a
// `request-complete` notification. Filters out short shell commands
// (ls, git status, …) that would otherwise toast on every keystroke.
// Long builds, npm installs, and claude turns still cross the threshold.
const MIN_RUNNING_MS_FOR_DONE = 1500

export class Notifier {
  private readonly previousState = new Map<string, SessionState>()
  private readonly runningSince = new Map<string, number>()
  private readonly sessions = new Map<string, SessionConfig>()
  // Tracks sessions where the user typed (or submitted) since the last idle.
  // Claude's TUI emits cursor-blink data continuously, which trips the
  // state machine in/out of running with no user intent — gating
  // `request-complete` on observed input filters those phantom transitions
  // so notifications only fire when there was actually a user request.
  private readonly hadInputSinceIdle = new Set<string>()

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly workspaceStore: WorkspaceStore,
    private readonly now: () => number = Date.now,
  ) {}

  registerSession(config: SessionConfig): void {
    this.sessions.set(config.id, config)
    this.previousState.set(config.id, 'idle')
  }

  updateSession(config: SessionConfig): void {
    if (this.sessions.has(config.id)) {
      this.sessions.set(config.id, config)
    }
  }

  unregisterSession(sessionId: string): void {
    this.sessions.delete(sessionId)
    this.previousState.delete(sessionId)
    this.runningSince.delete(sessionId)
    this.hadInputSinceIdle.delete(sessionId)
  }

  // Called from SessionManager.write — flags that the user typed or
  // submitted something. Cleared on the next running→idle transition so
  // each user request is gated independently.
  markUserInput(sessionId: string): void {
    this.hadInputSinceIdle.add(sessionId)
  }

  handleStateChange(sessionId: string, state: SessionState, exitCode?: number | null): void {
    const previous = this.previousState.get(sessionId) ?? 'idle'
    this.previousState.set(sessionId, state)
    if (previous === state) return

    // Track when each `running` phase began so we can measure its duration
    // on transition out. Entering running from any other state stamps; leaving
    // running clears so a future re-entry starts fresh.
    if (state === 'running' && previous !== 'running') {
      this.runningSince.set(sessionId, this.now())
    }

    const session = this.sessions.get(sessionId)
    if (!session) return

    if (state === 'asking') {
      this.emit(session, 'user-input-required')
      this.maybeNotify(session, this.titleFor(session, 'input needed'))
      return
    }

    if (previous === 'running' && state === 'idle') {
      const startedAt = this.runningSince.get(sessionId)
      this.runningSince.delete(sessionId)
      const hadInput = this.hadInputSinceIdle.delete(sessionId)
      const duration = startedAt !== undefined ? this.now() - startedAt : -1
      if (hadInput && startedAt !== undefined && duration >= MIN_RUNNING_MS_FOR_DONE) {
        this.emit(session, 'request-complete')
        this.maybeNotify(session, this.titleFor(session, 'done'))
      }
      return
    }

    if (state === 'ending' && exitCode !== undefined && exitCode !== null && exitCode !== 0) {
      this.emit(session, 'error')
      this.maybeNotify(session, this.titleFor(session, `exited ${exitCode}`))
    }
  }

  emitPermissionPrompt(workspaceId: string, path: string, kind: 'read' | 'write'): void {
    const win = this.getMainWindow()
    if (!win || win.isDestroyed()) return
    const workspace = this.workspaceStore.getById(workspaceId)
    const payload: NotificationPushEvent = {
      id: randomUUID(),
      workspaceId,
      workspaceName: workspace?.name ?? 'workspace',
      kind: 'permission-prompt',
      ts: Date.now(),
      detail: `${kind} access requested: ${path}`,
    }
    win.webContents.send(IpcChannel.NotifPush, payload)

    if (win.isFocused() && !win.isMinimized()) return
    if (!Notification.isSupported()) return
    const notification = new Notification({
      title: 'Permission requested',
      body: `${workspace?.name ?? 'workspace'} · ${kind} access to ${path}`,
      silent: false,
    })
    notification.on('click', () => {
      const w = this.getMainWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.focus()
    })
    notification.show()
  }

  private emit(session: SessionConfig, kind: NotificationKind): void {
    const win = this.getMainWindow()
    if (!win || win.isDestroyed()) return
    const workspace = this.workspaceStore.getById(session.workspaceId)
    const payload: NotificationPushEvent = {
      id: randomUUID(),
      workspaceId: session.workspaceId,
      sessionId: session.id,
      sessionLabel: session.label,
      workspaceName: workspace?.name ?? 'workspace',
      kind,
      ts: Date.now(),
    }
    win.webContents.send(IpcChannel.NotifPush, payload)
  }

  // Build the canonical notification title — `{workspace} - {label} : {status}`
  // — used for OS toasts. Sinks (renderer toast, notif center) can rebuild
  // the same string from the push event's structured fields.
  private titleFor(session: SessionConfig, status: string): string {
    const workspace = this.workspaceStore.getById(session.workspaceId)
    return `${workspace?.name ?? 'workspace'} - ${session.label} : ${status}`
  }

  private maybeNotify(session: SessionConfig, title: string): void {
    const win = this.getMainWindow()
    if (win && win.isFocused() && !win.isMinimized()) return
    if (!Notification.isSupported()) return

    const notification = new Notification({
      title,
      silent: false,
    })

    notification.on('click', () => {
      const w = this.getMainWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.focus()
      w.webContents.send(IpcChannel.SessionFocus, {
        sessionId: session.id,
        workspaceId: session.workspaceId,
      })
    })

    notification.show()
  }
}
