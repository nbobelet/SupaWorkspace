import { randomUUID } from 'node:crypto'
import type { BrowserWindow } from 'electron'
import { Notification } from 'electron'
import type { SessionConfig, SessionState } from '@shared/session'
import { IpcChannel } from '@shared/ipc'
import type { NotificationKind, NotificationPushEvent } from '@shared/notification'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'

export class Notifier {
  private readonly previousState = new Map<string, SessionState>()
  private readonly sessions = new Map<string, SessionConfig>()

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly workspaceStore: WorkspaceStore,
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
  }

  handleStateChange(sessionId: string, state: SessionState): void {
    const previous = this.previousState.get(sessionId) ?? 'idle'
    this.previousState.set(sessionId, state)
    if (previous === state) return

    const session = this.sessions.get(sessionId)
    if (!session) return

    if (state === 'waiting-for-input') {
      this.emit(session, 'waiting')
      this.maybeNotify(session, 'Claude needs input', 'waiting for permission or prompt')
      return
    }

    if (state === 'finished' && session.type === 'claude' && previous === 'running') {
      this.emit(session, 'finished')
      this.maybeNotify(session, 'Claude finished', 'session is idle')
      return
    }

    if (state === 'error') {
      this.emit(session, 'error')
      this.maybeNotify(session, 'Session errored', `${session.label} exited with error`)
    }
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

  private maybeNotify(session: SessionConfig, title: string, hint: string): void {
    const win = this.getMainWindow()
    if (win && win.isFocused() && !win.isMinimized()) return
    if (!Notification.isSupported()) return

    const workspace = this.workspaceStore.getById(session.workspaceId)
    const body = `${workspace?.name ?? 'workspace'} · ${session.label}${hint ? ` — ${hint}` : ''}`

    const notification = new Notification({
      title,
      body,
      silent: false,
    })

    notification.on('click', () => {
      const w = this.getMainWindow()
      if (!w) return
      if (w.isMinimized()) w.restore()
      w.focus()
      w.webContents.send(IpcChannel.SessionFocus, { sessionId: session.id })
    })

    notification.show()
  }
}
