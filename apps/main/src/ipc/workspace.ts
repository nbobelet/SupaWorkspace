import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { BrowserWindow } from 'electron';
import { dialog, ipcMain, shell } from 'electron'
import type {
  WorkspaceListResponse,
  WorkspaceOpenResponse,
  WorkspaceReadClaudeMdResponse,
  WorkspaceReadSettingsResponse} from '@shared/ipc';
import {
  ClaudeSettingsSchema,
  IpcChannel,
  WorkspaceReadClaudeMdRequest,
  WorkspaceReadSettingsRequest,
  WorkspaceRemoveRequest,
  WorkspaceRenameRequest,
  WorkspaceRevealRequest,
  WorkspaceSetColorRequest,
  WorkspaceWriteClaudeMdRequest,
  WorkspaceWriteSettingsRequest,
  type PermissionsGrantConflictsResponse,
} from '@shared/ipc'
import type { Workspace } from '@shared/workspace'
import type { SessionManager } from '../pty/SessionManager'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'

const CLAUDE_MD = 'CLAUDE.md'
const CLAUDE_SETTINGS = '.claude/settings.json'

export function registerWorkspaceIpc(opts: {
  workspaceStore: WorkspaceStore
  sessionManager: SessionManager
  getMainWindow: () => BrowserWindow | null
}): () => void {
  const { workspaceStore, sessionManager, getMainWindow } = opts

  ipcMain.handle(IpcChannel.WorkspaceList, async (): Promise<WorkspaceListResponse> => {
    return { workspaces: workspaceStore.list() }
  })

  ipcMain.handle(IpcChannel.WorkspaceOpen, async (): Promise<WorkspaceOpenResponse> => {
    const mainWin = getMainWindow()
    const result = mainWin
      ? await dialog.showOpenDialog(mainWin, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return { workspace: null }
    const root = result.filePaths[0]
    if (!root) return { workspace: null }
    const { workspace, wasExisting } = workspaceStore.openOrCreate(root)
    return { workspace, wasExisting }
  })

  ipcMain.handle(IpcChannel.WorkspaceRename, async (_, raw): Promise<Workspace> => {
    const req = WorkspaceRenameRequest.parse(raw)
    return workspaceStore.rename(req.workspaceId, req.name)
  })

  ipcMain.handle(IpcChannel.WorkspaceRemove, async (_, raw): Promise<void> => {
    const req = WorkspaceRemoveRequest.parse(raw)
    sessionManager.killAllInWorkspace(req.workspaceId)
    workspaceStore.remove(req.workspaceId)
  })

  ipcMain.handle(IpcChannel.WorkspaceSetColor, async (_, raw): Promise<Workspace> => {
    const req = WorkspaceSetColorRequest.parse(raw)
    return workspaceStore.setColor(req.workspaceId, req.hue)
  })

  ipcMain.handle(
    IpcChannel.PermissionsGrantConflicts,
    async (): Promise<PermissionsGrantConflictsResponse> => {
      return { conflicts: workspaceStore.findGrantConflicts() }
    },
  )

  ipcMain.handle(IpcChannel.WorkspaceReveal, async (_, raw): Promise<void> => {
    const req = WorkspaceRevealRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) return
    await shell.openPath(workspace.rootPath)
  })

  ipcMain.handle(IpcChannel.WorkspaceReadClaudeMd, async (_, raw): Promise<WorkspaceReadClaudeMdResponse> => {
    const req = WorkspaceReadClaudeMdRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    const path = join(workspace.rootPath, CLAUDE_MD)
    if (!existsSync(path)) return { content: '', exists: false }
    const content = await readFile(path, 'utf8')
    return { content, exists: true }
  })

  ipcMain.handle(IpcChannel.WorkspaceWriteClaudeMd, async (_, raw): Promise<void> => {
    const req = WorkspaceWriteClaudeMdRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    const path = join(workspace.rootPath, CLAUDE_MD)
    await writeFile(path, req.content, 'utf8')
  })

  ipcMain.handle(IpcChannel.WorkspaceReadSettings, async (_, raw): Promise<WorkspaceReadSettingsResponse> => {
    const req = WorkspaceReadSettingsRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    const path = join(workspace.rootPath, CLAUDE_SETTINGS)
    if (!existsSync(path)) return { settings: {}, exists: false }
    const raw_ = await readFile(path, 'utf8')
    try {
      const parsed = JSON.parse(raw_)
      return { settings: ClaudeSettingsSchema.parse(parsed), exists: true }
    } catch (err) {
      console.warn(`[workspace] settings.json invalid at ${path}:`, err)
      return { settings: {}, exists: true }
    }
  })

  ipcMain.handle(IpcChannel.WorkspaceWriteSettings, async (_, raw): Promise<void> => {
    const req = WorkspaceWriteSettingsRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    const path = join(workspace.rootPath, CLAUDE_SETTINGS)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(req.settings, null, 2), 'utf8')
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.WorkspaceList)
    ipcMain.removeHandler(IpcChannel.WorkspaceOpen)
    ipcMain.removeHandler(IpcChannel.WorkspaceRename)
    ipcMain.removeHandler(IpcChannel.WorkspaceRemove)
    ipcMain.removeHandler(IpcChannel.WorkspaceReveal)
    ipcMain.removeHandler(IpcChannel.WorkspaceReadClaudeMd)
    ipcMain.removeHandler(IpcChannel.WorkspaceWriteClaudeMd)
    ipcMain.removeHandler(IpcChannel.WorkspaceReadSettings)
    ipcMain.removeHandler(IpcChannel.WorkspaceWriteSettings)
    ipcMain.removeHandler(IpcChannel.WorkspaceSetColor)
    ipcMain.removeHandler(IpcChannel.PermissionsGrantConflicts)
  }
}
