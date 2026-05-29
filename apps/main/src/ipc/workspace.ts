import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveWithinBase } from '../workspace/validatePath'
import { getEffectiveCwd } from '../workspace/getEffectiveCwd'
import type { BrowserWindow } from 'electron'
import { dialog, ipcMain, shell } from 'electron'
import type {
  WorkspaceListDeletedResponse,
  WorkspaceListResponse,
  WorkspaceOpenResponse,
  WorkspaceReadClaudeMdResponse,
  WorkspaceReadSettingsResponse,
} from '@shared/ipc'
import {
  ClaudeSettingsSchema,
  IpcChannel,
  WorkspacePurgeRequest,
  WorkspaceReadClaudeMdRequest,
  WorkspaceReadSettingsRequest,
  WorkspaceRemoveRequest,
  WorkspaceRenameRequest,
  WorkspaceRestoreRequest,
  WorkspaceRevealRequest,
  WorkspaceSetColorRequest,
  WorkspaceSetWorkdirRequest,
  WorkspaceWriteClaudeMdRequest,
  WorkspaceWriteSettingsRequest,
  type PermissionsGrantConflictsResponse,
} from '@shared/ipc'
import type { Workspace } from '@shared/workspace'
import type { SessionManager } from '../pty/SessionManager'
import type { WorkspaceStore } from '../workspace/WorkspaceStore'
import type { NotesStore } from '../notes/NotesStore'
import type { SupaTTYStore } from '../supatty/SupaTTYStore'

const CLAUDE_MD = 'CLAUDE.md'
const CLAUDE_SETTINGS = '.claude/settings.json'

export function registerWorkspaceIpc(opts: {
  workspaceStore: WorkspaceStore
  sessionManager: SessionManager
  notesStore: NotesStore
  supattyStore: SupaTTYStore
  getMainWindow: () => BrowserWindow | null
}): () => void {
  const { workspaceStore, sessionManager, notesStore, supattyStore, getMainWindow } = opts

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
    // Soft delete: kill live sessions but keep the workspace row AND its
    // sub-app data (notes/supatty) intact so the trash can recover it.
    // Permanent cleanup happens in WorkspacePurge / retention sweep only.
    sessionManager.killAllInWorkspace(req.workspaceId)
    workspaceStore.softDelete(req.workspaceId)
  })

  ipcMain.handle(IpcChannel.WorkspaceRestore, async (_, raw): Promise<Workspace> => {
    const req = WorkspaceRestoreRequest.parse(raw)
    return workspaceStore.restore(req.workspaceId)
  })

  ipcMain.handle(
    IpcChannel.WorkspaceListDeleted,
    async (): Promise<WorkspaceListDeletedResponse> => {
      return { workspaces: workspaceStore.listDeleted() }
    },
  )

  ipcMain.handle(IpcChannel.WorkspacePurge, async (_, raw): Promise<void> => {
    const req = WorkspacePurgeRequest.parse(raw)
    sessionManager.killAllInWorkspace(req.workspaceId)
    // Permanent delete — drop the sub-app payloads then the metadata, else
    // the entries become orphans nothing references.
    supattyStore.remove(req.workspaceId)
    notesStore.remove(req.workspaceId)
    workspaceStore.purge(req.workspaceId)
  })

  ipcMain.handle(IpcChannel.WorkspaceSetColor, async (_, raw): Promise<Workspace> => {
    const req = WorkspaceSetColorRequest.parse(raw)
    return workspaceStore.setColor(req.workspaceId, req.hue)
  })

  ipcMain.handle(IpcChannel.WorkspaceSetWorkdir, async (_, raw): Promise<Workspace> => {
    const req = WorkspaceSetWorkdirRequest.parse(raw)
    const before = workspaceStore.getById(req.workspaceId)
    const updated = workspaceStore.setWorkdir(req.workspaceId, req.workdir)
    // A PTY's cwd is immutable, so live sessions don't follow a workdir change
    // on their own. Only WSL sessions are affected: a Linux workdir overrides
    // their effective cwd (getEffectiveCwd), whereas cmd/pwsh keep rootPath.
    // Respawn them (same id, renderer pane stays bound) so the running shell
    // lands in the new directory; new sessions already pick it up via spawn.
    if (before && before.workdir !== updated.workdir) {
      sessionManager.respawnWorkspaceSessions(updated.id, 'wsl', getEffectiveCwd(updated, 'wsl'))
    }
    return updated
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
    // Home has no rootPath; fall back to its cwd hint, else nothing to reveal.
    const target = workspace.rootPath ?? workspace.workdir
    if (!target) return
    await shell.openPath(target)
  })

  ipcMain.handle(
    IpcChannel.WorkspaceReadClaudeMd,
    async (_, raw): Promise<WorkspaceReadClaudeMdResponse> => {
      const req = WorkspaceReadClaudeMdRequest.parse(raw)
      const workspace = workspaceStore.getById(req.workspaceId)
      if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
      if (!workspace.rootPath) return { content: '', exists: false }
      const path = resolveWithinBase(workspace.rootPath, CLAUDE_MD)
      if (!existsSync(path)) return { content: '', exists: false }
      const content = await readFile(path, 'utf8')
      return { content, exists: true }
    },
  )

  ipcMain.handle(IpcChannel.WorkspaceWriteClaudeMd, async (_, raw): Promise<void> => {
    const req = WorkspaceWriteClaudeMdRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!workspace.rootPath) throw new Error('Workspace has no root path (CLAUDE.md unavailable)')
    const path = resolveWithinBase(workspace.rootPath, CLAUDE_MD)
    await writeFile(path, req.content, 'utf8')
  })

  ipcMain.handle(
    IpcChannel.WorkspaceReadSettings,
    async (_, raw): Promise<WorkspaceReadSettingsResponse> => {
      const req = WorkspaceReadSettingsRequest.parse(raw)
      const workspace = workspaceStore.getById(req.workspaceId)
      if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
      if (!workspace.rootPath) return { settings: {}, exists: false }
      const path = resolveWithinBase(workspace.rootPath, CLAUDE_SETTINGS)
      if (!existsSync(path)) return { settings: {}, exists: false }
      const raw_ = await readFile(path, 'utf8')
      try {
        const parsed = JSON.parse(raw_)
        return { settings: ClaudeSettingsSchema.parse(parsed), exists: true }
      } catch (err) {
        console.warn(`[workspace] settings.json invalid at ${path}:`, err)
        return { settings: {}, exists: true }
      }
    },
  )

  ipcMain.handle(IpcChannel.WorkspaceWriteSettings, async (_, raw): Promise<void> => {
    const req = WorkspaceWriteSettingsRequest.parse(raw)
    const workspace = workspaceStore.getById(req.workspaceId)
    if (!workspace) throw new Error(`Unknown workspace: ${req.workspaceId}`)
    if (!workspace.rootPath) throw new Error('Workspace has no root path (settings unavailable)')
    const path = resolveWithinBase(workspace.rootPath, CLAUDE_SETTINGS)
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, JSON.stringify(req.settings, null, 2), 'utf8')
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.WorkspaceList)
    ipcMain.removeHandler(IpcChannel.WorkspaceOpen)
    ipcMain.removeHandler(IpcChannel.WorkspaceRename)
    ipcMain.removeHandler(IpcChannel.WorkspaceRemove)
    ipcMain.removeHandler(IpcChannel.WorkspaceRestore)
    ipcMain.removeHandler(IpcChannel.WorkspacePurge)
    ipcMain.removeHandler(IpcChannel.WorkspaceListDeleted)
    ipcMain.removeHandler(IpcChannel.WorkspaceReveal)
    ipcMain.removeHandler(IpcChannel.WorkspaceReadClaudeMd)
    ipcMain.removeHandler(IpcChannel.WorkspaceWriteClaudeMd)
    ipcMain.removeHandler(IpcChannel.WorkspaceReadSettings)
    ipcMain.removeHandler(IpcChannel.WorkspaceWriteSettings)
    ipcMain.removeHandler(IpcChannel.WorkspaceSetColor)
    ipcMain.removeHandler(IpcChannel.WorkspaceSetWorkdir)
    ipcMain.removeHandler(IpcChannel.PermissionsGrantConflicts)
  }
}
