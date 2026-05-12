import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Toaster, toast } from 'sonner'
import { Settings as SettingsIcon } from 'lucide-react'
import { PaneMosaic } from './components/PaneMosaic'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { SessionTabs } from './components/SessionTabs'
import { LayoutSwitcher } from './components/LayoutSwitcher'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { CommandPalette } from './components/CommandPalette'
import { SessionCommandBar } from './components/SessionCommandBar'
import { CmdGuardModal } from './components/CmdGuardModal'
import { BugReportButton } from './components/BugReportButton'
import { BugReportDialog } from './components/BugReportDialog'
import { useScopedOrder, useSessionStore } from './state/sessionStore'
import { useWorkspaceStore } from './state/workspaceStore'
import { useLayoutStore } from './state/layoutStore'
import { useNotificationStore } from './state/notificationStore'
import { usePaletteStore } from './state/paletteStore'
import { useSessionCommandBarStore } from './state/sessionCommandBarStore'
import { useCmdGuardStore } from './state/cmdGuardStore'
import { useSearchBarStore } from './state/searchBarStore'
import { useKeybindings } from './hooks/useKeybindings'
import { focusSession } from './hooks/useTerminalSession'
import { withViewTransition } from './lib/viewTransition'
import { addSessionWithFocus, activateSession } from './lib/sessionFocus'
import { closeSession } from './lib/closeSession'
import type { SessionType } from '@shared/session'

export function App(): ReactElement {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  const setActive = useSessionStore((s) => s.setActive)
  const activeId = useSessionStore((s) => s.activeId)
  const addSession = useSessionStore((s) => s.addSession)
  const lastUsedType = useSessionStore((s) => s.lastUsedType)
  const reorderScopedTab = useSessionStore((s) => s.reorderScopedTab)
  const scopedOrder = useScopedOrder()

  const cycleMode = useLayoutStore((s) => s.cycleMode)
  const setLayoutMode = useLayoutStore((s) => s.setMode)
  const setExperimentalEnabled = useLayoutStore((s) => s.setExperimentalEnabled)

  const pushNotif = useNotificationStore((s) => s.push)
  const togglePalette = usePaletteStore((s) => s.toggle)
  const toggleInputBar = useSessionCommandBarStore((s) => s.toggleVisible)
  const loadCmdGuard = useCmdGuardStore((s) => s.load)

  const [settingsOpen, setSettingsOpen] = useState(false)

  const focusSessionCommandBar = useCallback(() => {
    if (!useSessionCommandBarStore.getState().visible) {
      useSessionCommandBarStore.getState().toggleVisible()
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new CustomEvent('session-command-bar:focus-request'))
    })
  }, [])

  // Workspace-scoped command bar does not exist as a persistent component
  // today (the WorkspaceSidebar uses an inline rename input only). Stub kept
  // for symmetry — bind a shortcut here once a real WorkspaceCommandBar lands.
  const focusWorkspaceCommandBar = useCallback(() => {
    window.dispatchEvent(new CustomEvent('workspace-command-bar:focus-request'))
  }, [])

  const toggleAppSettings = useCallback(() => {
    setSettingsOpen((v) => !v)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const wsRes = await window.ws.workspace.list()
      if (cancelled) return
      setWorkspaces(wsRes.workspaces)
      const validIds = new Set(wsRes.workspaces.map((w) => w.id))
      const snapRes = await window.ws.sessionSnapshot.list()
      if (cancelled) return
      // Register snapshot entries as placeholders. PTYs are spawned lazily on
      // first activation so launching the app with N tabs no longer fires N
      // xterm / shell processes up front.
      for (const entry of snapRes.envelope.entries) {
        if (!validIds.has(entry.workspaceId)) continue
        addSession({
          id: `pending-${crypto.randomUUID()}`,
          workspaceId: entry.workspaceId,
          type: entry.type,
          label: entry.label,
          state: 'idle',
          pendingSpawn: true,
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setWorkspaces, addSession])

  useEffect(() => {
    const unsubscribe = window.ws.session.onFocus(({ sessionId, workspaceId }) => {
      withViewTransition(() => {
        if (workspaceId) setActiveWorkspace(workspaceId)
        setActive(sessionId)
      })
      requestAnimationFrame(() => focusSession(sessionId))
    })
    return unsubscribe
  }, [setActive, setActiveWorkspace])

  useEffect(() => {
    if (!activeWorkspaceId) return
    const state = useSessionStore.getState()
    const remembered = state.activeByWorkspace[activeWorkspaceId]
    const stillValid =
      remembered && state.sessions[remembered]?.workspaceId === activeWorkspaceId
        ? remembered
        : null
    const fallback = state.order.find((sid) => state.sessions[sid]?.workspaceId === activeWorkspaceId)
    const target = stillValid ?? fallback ?? null
    if (target) {
      // Only mark the tab as active. Do NOT lazily spawn — switching workspaces
      // must not implicitly start PTYs. The user activates explicitly to spawn.
      setActive(target)
      const session = state.sessions[target]
      if (session && !session.pendingSpawn) {
        requestAnimationFrame(() => focusSession(target))
      }
    }
  }, [activeWorkspaceId, setActive])

  useEffect(() => {
    const focusFromNotif = (workspaceId: string, sessionId?: string): void => {
      withViewTransition(() => {
        setActiveWorkspace(workspaceId)
        if (sessionId) setActive(sessionId)
      })
      if (sessionId) requestAnimationFrame(() => focusSession(sessionId))
    }
    const unsubscribe = window.ws.notifications.onPush((event) => {
      pushNotif(event)
      const title =
        event.kind === 'user-input-required'
          ? 'Claude needs input'
          : event.kind === 'request-complete'
            ? 'Claude finished'
            : event.kind === 'permission-prompt'
              ? 'Permission requested'
              : 'Session errored'
      const description = event.sessionLabel
        ? `${event.workspaceName} · ${event.sessionLabel}`
        : event.workspaceName
      const action = {
        label: 'Open',
        onClick: () => focusFromNotif(event.workspaceId, event.sessionId),
      }
      if (event.kind === 'error') toast.error(title, { description, action })
      else if (event.kind === 'user-input-required' || event.kind === 'permission-prompt')
        toast.warning(title, { description, action })
      else toast.success(title, { description, action })
    })
    return unsubscribe
  }, [pushNotif, setActive, setActiveWorkspace])

  useEffect(() => {
    void loadCmdGuard()
  }, [loadCmdGuard])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.has('experimentalLayouts')) {
      setExperimentalEnabled(params.get('experimentalLayouts') !== '0')
    }
  }, [setExperimentalEnabled])

  const spawnLastUsed = useCallback(
    async (type: SessionType) => {
      if (!activeWorkspaceId) return
      const res = await window.ws.session.spawn({
        workspaceId: activeWorkspaceId,
        type,
        cols: 80,
        rows: 24,
      })
      addSessionWithFocus({
        id: res.sessionId,
        workspaceId: activeWorkspaceId,
        type,
        label: res.label,
        state: 'idle',
      })
    },
    [activeWorkspaceId],
  )

  const cycleWorkspace = useCallback(
    (direction: 1 | -1) => {
      if (workspaces.length === 0) return
      const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId)
      const nextIdx = idx === -1 ? 0 : (idx + direction + workspaces.length) % workspaces.length
      const next = workspaces[nextIdx]
      if (next) withViewTransition(() => setActiveWorkspace(next.id))
    },
    [workspaces, activeWorkspaceId, setActiveWorkspace],
  )

  const cycleSession = useCallback(
    (direction: 1 | -1) => {
      if (scopedOrder.length === 0) return
      const idx = activeId ? scopedOrder.indexOf(activeId) : -1
      const nextIdx =
        idx === -1
          ? direction === 1
            ? 0
            : scopedOrder.length - 1
          : (idx + direction + scopedOrder.length) % scopedOrder.length
      const next = scopedOrder[nextIdx]
      if (next) void activateSession(next)
    },
    [scopedOrder, activeId],
  )

  const reorderActiveTab = useCallback(
    (direction: 1 | -1) => {
      if (!activeWorkspaceId || !activeId) return
      const from = scopedOrder.indexOf(activeId)
      if (from === -1) return
      const to = from + direction
      if (to < 0 || to >= scopedOrder.length) return
      reorderScopedTab(activeWorkspaceId, from, to)
    },
    [activeWorkspaceId, activeId, scopedOrder, reorderScopedTab],
  )

  useKeybindings({
    cycleSessionNext: () => cycleSession(1),
    cycleSessionPrev: () => cycleSession(-1),
    jumpToSession: (i) => {
      const id = scopedOrder[i]
      if (id) void activateSession(id)
    },
    spawnLastUsed: () => void spawnLastUsed(lastUsedType),
    killActive: () => {
      if (activeId) closeSession(activeId)
    },
    cycleWorkspaceNext: () => cycleWorkspace(1),
    cycleWorkspacePrev: () => cycleWorkspace(-1),
    renameActiveTab: () => {
      if (!activeId) return
      window.dispatchEvent(
        new CustomEvent('session:rename-request', { detail: { sessionId: activeId } }),
      )
    },
    renameActiveWorkspace: () => {
      window.dispatchEvent(new CustomEvent('workspace:rename-active'))
    },
    togglePalette,
    toggleInputBar,
    cycleLayout: () => {
      if (activeWorkspaceId) cycleMode(activeWorkspaceId)
    },
    reorderActiveTabLeft: () => reorderActiveTab(-1),
    reorderActiveTabRight: () => reorderActiveTab(1),
    splitVertical: () => {
      if (activeWorkspaceId) setLayoutMode(activeWorkspaceId, 'split-vertical')
    },
    splitHorizontal: () => {
      if (activeWorkspaceId) setLayoutMode(activeWorkspaceId, 'split-horizontal')
    },
    focusSessionCommandBar,
    focusWorkspaceCommandBar,
    toggleAppSettings,
    // Cmd+F / Ctrl+F — toggles the floating SearchBar for the active
    // session. The keybinding's editable-target guard already documents
    // the `.xterm` exception so the binding fires while the user is
    // typing in the terminal.
    toggleSearchBar: () => {
      if (activeId) useSearchBarStore.getState().toggle(activeId)
    },
  })

  return (
    <div className="flex h-screen w-screen bg-bg text-fg">
      <WorkspaceSidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-end gap-2 border-b border-border bg-bg-sunken px-3 py-1.5 text-xs">
          <button
            type="button"
            onClick={toggleAppSettings}
            aria-pressed={settingsOpen}
            aria-label="Toggle settings"
            title="Toggle settings (Ctrl+,)"
            className={[
              'inline-flex items-center gap-1 rounded-sm border px-2 py-1 text-xs',
              settingsOpen
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-elevated text-fg-subtle hover:border-border-strong',
            ].join(' ')}
          >
            <SettingsIcon size={12} aria-hidden="true" />
            <span>Settings</span>
          </button>
          <BugReportButton />
          <LayoutSwitcher />
        </header>
        <SessionTabs />
        <div className="flex-1 overflow-hidden">
          <PaneMosaic />
        </div>
        <SessionCommandBar />
        <footer className="flex items-center justify-between border-t border-border bg-bg-sunken px-3 py-1 text-[10px] text-muted">
          <span>
            Ctrl+K palette · Ctrl+/ input bar · Ctrl+I focus input · Ctrl+, settings · Ctrl+1–9 focus
            · Ctrl+\ layout · Ctrl+T new {lastUsedType}
          </span>
          <span>
            {scopedOrder.length} session{scopedOrder.length === 1 ? '' : 's'}
          </span>
        </footer>
      </div>

      {settingsOpen && activeWorkspaceId && (
        <SettingsPanel workspaceId={activeWorkspaceId} onClose={() => setSettingsOpen(false)} />
      )}

      <CommandPalette />
      <CmdGuardModal />
      <BugReportDialog />
      <Toaster
        position="top-right"
        visibleToasts={3}
        duration={4000}
        closeButton
        richColors
        theme="dark"
      />
    </div>
  )
}
