import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcChannelName,
  NotesGetResponse,
  PermissionsGrantConflictsResponse,
  PermissionsRequestPathRequest,
  PermissionsRequestPathResponse,
  PermissionsRevokePathRequest,
  SessionDataEvent,
  SessionExitEvent,
  SessionFocusEvent,
  SessionKillRequest,
  SessionRenameRequest,
  SessionRenameResponse,
  SessionResizeRequest,
  SessionSpawnRequest,
  SessionSpawnResponse,
  SessionStateEvent,
  SessionSubmitRequest,
  SessionWriteRequest,
  WorkspaceListResponse,
  WorkspaceOpenResponse,
  WorkspaceReadClaudeMdResponse,
  WorkspaceReadSettingsResponse,
  ClaudeSettings,
  InputHistoryGetResponse,
  InputHistoryAppendRequest,
  InputHistoryAppendResponse,
} from '@shared/ipc'
import type { SessionSnapshotListResponse, SessionSnapshotClearResponse } from '@shared/snapshot'
import type {
  CmdGuardGetResponse,
  CmdGuardSetRulesRequest,
  CmdGuardAppendAuditRequest,
} from '@shared/cmdGuard'
import type {
  BugReportCreateRequest,
  BugReportCreateResponse,
  BugReportListResponse,
} from '@shared/bugReport'
import { IpcChannel } from '@shared/ipc'
import type { NotificationPushEvent } from '@shared/notification'
import type { Workspace } from '@shared/workspace'

type Unsubscribe = () => void

function on<T>(channel: IpcChannelName, listener: (payload: T) => void): Unsubscribe {
  const handler = (_: unknown, payload: T): void => listener(payload)
  ipcRenderer.on(channel, handler)
  return () => {
    ipcRenderer.removeListener(channel, handler)
  }
}

const api = {
  session: {
    spawn: (req: SessionSpawnRequest): Promise<SessionSpawnResponse> =>
      ipcRenderer.invoke(IpcChannel.SessionSpawn, req),
    write: (req: SessionWriteRequest): Promise<void> => ipcRenderer.invoke(IpcChannel.SessionWrite, req),
    submit: (req: SessionSubmitRequest): Promise<void> => ipcRenderer.invoke(IpcChannel.SessionSubmit, req),
    resize: (req: SessionResizeRequest): Promise<void> => ipcRenderer.invoke(IpcChannel.SessionResize, req),
    kill: (req: SessionKillRequest): Promise<void> => ipcRenderer.invoke(IpcChannel.SessionKill, req),
    rename: (req: SessionRenameRequest): Promise<SessionRenameResponse> =>
      ipcRenderer.invoke(IpcChannel.SessionRename, req),
    onData: (listener: (event: SessionDataEvent) => void): Unsubscribe =>
      on<SessionDataEvent>(IpcChannel.SessionData, listener),
    onExit: (listener: (event: SessionExitEvent) => void): Unsubscribe =>
      on<SessionExitEvent>(IpcChannel.SessionExit, listener),
    onState: (listener: (event: SessionStateEvent) => void): Unsubscribe =>
      on<SessionStateEvent>(IpcChannel.SessionState, listener),
    onFocus: (listener: (event: SessionFocusEvent) => void): Unsubscribe =>
      on<SessionFocusEvent>(IpcChannel.SessionFocus, listener),
  },
  workspace: {
    list: (): Promise<WorkspaceListResponse> => ipcRenderer.invoke(IpcChannel.WorkspaceList),
    open: (): Promise<WorkspaceOpenResponse> => ipcRenderer.invoke(IpcChannel.WorkspaceOpen),
    rename: (workspaceId: string, name: string): Promise<Workspace> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceRename, { workspaceId, name }),
    remove: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceRemove, { workspaceId }),
    reveal: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceReveal, { workspaceId }),
    readClaudeMd: (workspaceId: string): Promise<WorkspaceReadClaudeMdResponse> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceReadClaudeMd, { workspaceId }),
    writeClaudeMd: (workspaceId: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceWriteClaudeMd, { workspaceId, content }),
    readSettings: (workspaceId: string): Promise<WorkspaceReadSettingsResponse> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceReadSettings, { workspaceId }),
    writeSettings: (workspaceId: string, settings: ClaudeSettings): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceWriteSettings, { workspaceId, settings }),
    setColor: (workspaceId: string, hue: number): Promise<Workspace> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceSetColor, { workspaceId, hue }),
  },
  permissions: {
    requestPath: (req: PermissionsRequestPathRequest): Promise<PermissionsRequestPathResponse> =>
      ipcRenderer.invoke(IpcChannel.PermissionsRequestPath, req),
    revokePath: (req: PermissionsRevokePathRequest): Promise<Workspace> =>
      ipcRenderer.invoke(IpcChannel.PermissionsRevokePath, req),
    grantConflicts: (): Promise<PermissionsGrantConflictsResponse> =>
      ipcRenderer.invoke(IpcChannel.PermissionsGrantConflicts),
  },
  notifications: {
    onPush: (listener: (event: NotificationPushEvent) => void): Unsubscribe =>
      on<NotificationPushEvent>(IpcChannel.NotifPush, listener),
  },
  notes: {
    get: (): Promise<NotesGetResponse> => ipcRenderer.invoke(IpcChannel.NotesGet),
    set: (content: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.NotesSet, { content }),
  },
  inputHistory: {
    get: (): Promise<InputHistoryGetResponse> => ipcRenderer.invoke(IpcChannel.InputHistoryGet),
    append: (req: InputHistoryAppendRequest): Promise<InputHistoryAppendResponse> =>
      ipcRenderer.invoke(IpcChannel.InputHistoryAppend, req),
  },
  sessionSnapshot: {
    list: (): Promise<SessionSnapshotListResponse> =>
      ipcRenderer.invoke(IpcChannel.SessionSnapshotList),
    clear: (): Promise<SessionSnapshotClearResponse> =>
      ipcRenderer.invoke(IpcChannel.SessionSnapshotClear),
  },
  cmdGuard: {
    get: (): Promise<CmdGuardGetResponse> => ipcRenderer.invoke(IpcChannel.CmdGuardGet),
    setRules: (req: CmdGuardSetRulesRequest): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.CmdGuardSetRules, req),
    appendAudit: (req: CmdGuardAppendAuditRequest): Promise<CmdGuardGetResponse> =>
      ipcRenderer.invoke(IpcChannel.CmdGuardAppendAudit, req),
  },
  bugReport: {
    create: (req: BugReportCreateRequest): Promise<BugReportCreateResponse> =>
      ipcRenderer.invoke(IpcChannel.BugReportCreate, req),
    list: (): Promise<BugReportListResponse> => ipcRenderer.invoke(IpcChannel.BugReportList),
    revealDir: (): Promise<void> => ipcRenderer.invoke(IpcChannel.BugReportRevealDir),
  },
}

export type SupaWorkspaceApi = typeof api

contextBridge.exposeInMainWorld('ws', api)
