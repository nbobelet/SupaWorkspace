import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runPtySmoke } from './pty/smoke'
import { SessionManager } from './pty/SessionManager'
import { WorkspaceStore } from './workspace/WorkspaceStore'
import { Notifier } from './notifications/Notifier'
import { registerSessionIpc } from './ipc/session'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerPermissionsIpc } from './ipc/permissions'
import { IpcChannel } from '@shared/ipc'

const __dirname = dirname(fileURLToPath(import.meta.url))

let mainWindow: BrowserWindow | null = null

function getMainWindow(): BrowserWindow | null {
  return mainWindow
}

function broadcast(channel: string, payload: unknown): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send(channel, payload)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('http://localhost') || url.startsWith('file://') || url.startsWith('app://')
    if (!allowed) {
      event.preventDefault()
      void shell.openExternal(url)
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

void app.whenReady().then(async () => {
  const ptyOk = await runPtySmoke()
  if (!ptyOk) {
    console.error('[pty] smoke FAILED — node-pty cannot spawn. App will continue but PTY features are broken.')
  }

  const workspaceStore = new WorkspaceStore()
  const notifier = new Notifier(getMainWindow, workspaceStore)
  const sessionManager = new SessionManager({
    onData: (sessionId, data) => broadcast(IpcChannel.SessionData, { sessionId, data }),
    onExit: (sessionId, exitCode, signal) => {
      broadcast(IpcChannel.SessionExit, { sessionId, exitCode, signal })
      notifier.unregisterSession(sessionId)
    },
    onState: (sessionId, state) => {
      broadcast(IpcChannel.SessionState, { sessionId, state })
      notifier.handleStateChange(sessionId, state)
    },
  })

  registerSessionIpc({
    sessionManager,
    workspaceStore,
    onSpawn: (cfg) => notifier.registerSession(cfg),
    onRename: (cfg) => notifier.updateSession(cfg),
  })
  registerWorkspaceIpc({ workspaceStore, sessionManager, getMainWindow })
  registerPermissionsIpc({ workspaceStore, getMainWindow, notifier })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on('before-quit', () => {
    sessionManager.killAll()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
