import { app, BrowserWindow, shell } from 'electron'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { runPtySmoke } from './pty/smoke'
import { SessionManager } from './pty/SessionManager'
import { WorkspaceStore } from './workspace/WorkspaceStore'
import { Notifier } from './notifications/Notifier'
import { NotesStore } from './notes/NotesStore'
import { SupaTTYStore } from './supatty/SupaTTYStore'
import { TodoStore } from './todo/TodoStore'
import { CmdGuardStore } from './cmd-guard/CmdGuardStore'
import { BugReportStore } from './bug-report/BugReportStore'
import { SettingsStore } from './settings/SettingsStore'
import { registerSessionIpc } from './ipc/session'
import { registerWorkspaceIpc } from './ipc/workspace'
import { registerPermissionsIpc } from './ipc/permissions'
import { registerNotesIpc } from './ipc/notes'
import { registerTodoIpc } from './ipc/todo'
import { registerSessionSnapshotIpc } from './ipc/sessionSnapshot'
import { registerCmdGuardIpc } from './ipc/cmdGuard'
import { registerBugReportIpc } from './ipc/bugReport'
import { registerSettingsIpc } from './ipc/settings'
import { registerVoiceIpc } from './ipc/voice'
import { StubTranscriber, WhisperWorkerTranscriber } from './voice/Transcriber'
import { VoiceService } from './voice/VoiceService'
import { registerExplorerIpc } from './explorer'
import { registerCapabilitiesIpc } from './ipc/capabilities'
import { IpcChannel } from '@shared/ipc'
import { WORKSPACE_RETENTION_MS } from '@shared/workspace'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Shared userData path between dev and packaged builds.
// Bump SHARED_DATA_VERSION when a store schema becomes non-backward-compatible
// so old versions keep reading their own dir as a rollback.
// Respect --user-data-dir CLI flag (used by Playwright e2e to isolate state).
const SHARED_DATA_VERSION = 'v1'
const hasExplicitUserDataDir = process.argv.some(
  (arg) => arg === '--user-data-dir' || arg.startsWith('--user-data-dir='),
)
if (!hasExplicitUserDataDir) {
  const SHARED_USER_DATA = join(app.getPath('appData'), 'SupaWorkspace', SHARED_DATA_VERSION)
  app.setPath('userData', SHARED_USER_DATA)
}
console.log(`[supa] userData = ${app.getPath('userData')}`)

let mainWindow: BrowserWindow | null = null

const APP_TITLE = `SupaWorkspace - ${app.isPackaged ? 'PROD' : 'DEV'}`

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
    title: APP_TITLE,
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

  mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
  })
  mainWindow.setTitle(APP_TITLE)

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allowed =
      url.startsWith('http://localhost') || url.startsWith('file://') || url.startsWith('app://')
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
    console.error(
      '[pty] smoke FAILED — node-pty cannot spawn. App will continue but PTY features are broken.',
    )
  }

  const workspaceStore = new WorkspaceStore()
  const notesStore = new NotesStore()
  const supattyStore = new SupaTTYStore({ userDataDir: app.getPath('userData') })
  const todoStore = new TodoStore()

  // Retention sweep: drop trashed workspaces past the 30-day window and cascade
  // their sub-app data, so expired trash leaves no orphan notes/todo/supatty.
  for (const purgedId of workspaceStore.purgeExpired(WORKSPACE_RETENTION_MS)) {
    supattyStore.remove(purgedId)
    notesStore.remove(purgedId)
    todoStore.remove(purgedId)
  }
  const cmdGuardStore = new CmdGuardStore()
  const bugReportStore = new BugReportStore({
    isPackaged: app.isPackaged,
    appPath: app.getAppPath(),
    appVersion: app.getVersion(),
    userDataDir: app.getPath('userData'),
    openPath: (p) => shell.openPath(p),
  })
  const settingsStore = new SettingsStore()
  const notifier = new Notifier(getMainWindow, workspaceStore)
  const sessionManager = new SessionManager({
    onData: (sessionId, data) => broadcast(IpcChannel.SessionData, { sessionId, data }),
    onExit: (sessionId, exitCode, signal) => {
      broadcast(IpcChannel.SessionExit, { sessionId, exitCode, signal })
      notifier.unregisterSession(sessionId)
    },
    onState: (sessionId, state, exitCode) => {
      broadcast(IpcChannel.SessionState, { sessionId, state, exitCode: exitCode ?? null })
      notifier.handleStateChange(sessionId, state, exitCode)
    },
    onUserInput: (sessionId) => notifier.markUserInput(sessionId),
    onSessionsChanged: (configs) => {
      supattyStore.saveAllFromFlat(
        configs.map((c) => ({ workspaceId: c.workspaceId, type: c.type, label: c.label })),
      )
    },
  })
  // Late-bind the request-complete pulse: notifier emits, detector pulses.
  // Construction is cyclic (sessionManager.onState → notifier; notifier's
  // callback → sessionManager.markDone) so we wire it post-construction.
  notifier.onRequestComplete = (sessionId) => sessionManager.markDone(sessionId)

  registerSessionIpc({
    sessionManager,
    workspaceStore,
    onSpawn: (cfg) => notifier.registerSession(cfg),
    onRename: (cfg) => notifier.updateSession(cfg),
  })
  registerWorkspaceIpc({
    workspaceStore,
    sessionManager,
    notesStore,
    supattyStore,
    todoStore,
    getMainWindow,
  })
  registerPermissionsIpc({ workspaceStore, getMainWindow, notifier })
  registerNotesIpc({ notesStore })
  registerTodoIpc({ todoStore })
  registerSessionSnapshotIpc({ supattyStore })
  registerCmdGuardIpc({ cmdGuardStore })
  registerBugReportIpc({ bugReportStore })
  registerSettingsIpc({ settingsStore })
  const voiceService = new VoiceService({
    transcriber: process.env.SUPA_VOICE_STUB
      ? new StubTranscriber()
      : new WhisperWorkerTranscriber(app.getPath('userData'), join(__dirname, 'voice-worker.js')),
    getSession: (id) => sessionManager.getConfig(id),
  })
  registerVoiceIpc({ voiceService })
  registerExplorerIpc({ workspaceStore })
  registerCapabilitiesIpc()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  app.on('before-quit', () => {
    supattyStore.lock()
    sessionManager.killAll()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
