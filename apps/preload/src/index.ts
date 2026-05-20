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
  SessionWriteRequest,
  TodoCreateTaskRequest,
  TodoDeleteTaskRequest,
  TodoGetResponse,
  TodoReorderRequest,
  TodoSetColumnsRequest,
  TodoStateResponse,
  TodoUpdateTaskRequest,
  WorkspaceListDeletedResponse,
  WorkspaceListResponse,
  WorkspaceOpenResponse,
  WorkspaceReadClaudeMdResponse,
  WorkspaceReadSettingsResponse,
  ClaudeSettings,
  Settings,
  SettingsUpdatePayload,
  ExplorerListDirResponse,
  ExplorerOpenResponse,
  ExplorerReadFileResponse,
  ExplorerSearchResponse,
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
    write: (req: SessionWriteRequest): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.SessionWrite, req),
    resize: (req: SessionResizeRequest): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.SessionResize, req),
    kill: (req: SessionKillRequest): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.SessionKill, req),
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
    restore: (workspaceId: string): Promise<Workspace> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceRestore, { workspaceId }),
    purge: (workspaceId: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.WorkspacePurge, { workspaceId }),
    listDeleted: (): Promise<WorkspaceListDeletedResponse> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceListDeleted),
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
    setWorkdir: (workspaceId: string, workdir: string | null): Promise<Workspace> =>
      ipcRenderer.invoke(IpcChannel.WorkspaceSetWorkdir, { workspaceId, workdir }),
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
    get: (workspaceId: string): Promise<NotesGetResponse> =>
      ipcRenderer.invoke(IpcChannel.NotesGet, { workspaceId }),
    set: (workspaceId: string, content: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.NotesSet, { workspaceId, content }),
  },
  todo: {
    get: (workspaceId: string): Promise<TodoGetResponse> =>
      ipcRenderer.invoke(IpcChannel.TodoGet, { workspaceId }),
    createTask: (req: TodoCreateTaskRequest): Promise<TodoStateResponse> =>
      ipcRenderer.invoke(IpcChannel.TodoCreateTask, req),
    updateTask: (req: TodoUpdateTaskRequest): Promise<TodoStateResponse> =>
      ipcRenderer.invoke(IpcChannel.TodoUpdateTask, req),
    deleteTask: (req: TodoDeleteTaskRequest): Promise<TodoStateResponse> =>
      ipcRenderer.invoke(IpcChannel.TodoDeleteTask, req),
    reorder: (req: TodoReorderRequest): Promise<TodoStateResponse> =>
      ipcRenderer.invoke(IpcChannel.TodoReorder, req),
    setColumns: (req: TodoSetColumnsRequest): Promise<TodoStateResponse> =>
      ipcRenderer.invoke(IpcChannel.TodoSetColumns, req),
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
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke(IpcChannel.SettingsGet),
    update: (payload: SettingsUpdatePayload): Promise<Settings> =>
      ipcRenderer.invoke(IpcChannel.SettingsUpdate, payload),
  },
  explorer: {
    listDir: (workspaceId: string, relPath: string): Promise<ExplorerListDirResponse> =>
      ipcRenderer.invoke(IpcChannel.ExplorerListDir, { workspaceId, relPath }),
    open: (workspaceId: string, relPath: string): Promise<ExplorerOpenResponse> =>
      ipcRenderer.invoke(IpcChannel.ExplorerOpen, { workspaceId, relPath }),
    readFile: (
      workspaceId: string,
      relPath: string,
      full?: boolean,
    ): Promise<ExplorerReadFileResponse> =>
      ipcRenderer.invoke(IpcChannel.ExplorerReadFile, { workspaceId, relPath, full }),
    reveal: (workspaceId: string, relPath: string): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.ExplorerReveal, { workspaceId, relPath }),
    search: (
      workspaceId: string,
      query: string,
      searchId: number,
    ): Promise<ExplorerSearchResponse> =>
      ipcRenderer.invoke(IpcChannel.ExplorerSearch, { workspaceId, query, searchId }),
    searchCancel: (workspaceId: string, searchId: number): Promise<void> =>
      ipcRenderer.invoke(IpcChannel.ExplorerSearchCancel, { workspaceId, searchId }),
  },
}

export type SupaWorkspaceApi = typeof api

contextBridge.exposeInMainWorld('ws', api)
