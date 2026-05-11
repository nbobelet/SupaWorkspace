import { contextBridge, ipcRenderer } from 'electron'
import type {
  IpcChannelName,
  PermissionsRequestPathRequest,
  PermissionsRequestPathResponse,
  PermissionsRevokePathRequest,
  SessionDataEvent,
  SessionExitEvent,
  SessionKillRequest,
  SessionResizeRequest,
  SessionSpawnRequest,
  SessionSpawnResponse,
  SessionStateEvent,
  SessionWriteRequest,
  WorkspaceListResponse,
  WorkspaceOpenResponse,
  WorkspaceReadClaudeMdResponse,
  WorkspaceReadSettingsResponse,
  ClaudeSettings,
} from '@shared/ipc'
import { IpcChannel } from '@shared/ipc'
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
    resize: (req: SessionResizeRequest): Promise<void> => ipcRenderer.invoke(IpcChannel.SessionResize, req),
    kill: (req: SessionKillRequest): Promise<void> => ipcRenderer.invoke(IpcChannel.SessionKill, req),
    onData: (listener: (event: SessionDataEvent) => void): Unsubscribe =>
      on<SessionDataEvent>(IpcChannel.SessionData, listener),
    onExit: (listener: (event: SessionExitEvent) => void): Unsubscribe =>
      on<SessionExitEvent>(IpcChannel.SessionExit, listener),
    onState: (listener: (event: SessionStateEvent) => void): Unsubscribe =>
      on<SessionStateEvent>(IpcChannel.SessionState, listener),
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
  },
  permissions: {
    requestPath: (req: PermissionsRequestPathRequest): Promise<PermissionsRequestPathResponse> =>
      ipcRenderer.invoke(IpcChannel.PermissionsRequestPath, req),
    revokePath: (req: PermissionsRevokePathRequest): Promise<Workspace> =>
      ipcRenderer.invoke(IpcChannel.PermissionsRevokePath, req),
  },
}

export type ClaudeWorkspaceApi = typeof api

contextBridge.exposeInMainWorld('ws', api)
