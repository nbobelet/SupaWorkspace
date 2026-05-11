import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { Toaster, toast } from 'sonner'
import { PaneMosaic } from './components/PaneMosaic'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { SessionTabs } from './components/SessionTabs'
import { LayoutSwitcher } from './components/LayoutSwitcher'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { CommandPalette } from './components/CommandPalette'
import { useScopedOrder, useSessionStore } from './state/sessionStore'
import { useWorkspaceStore } from './state/workspaceStore'
import { useLayoutStore } from './state/layoutStore'
import { useNotificationStore } from './state/notificationStore'
import { usePaletteStore } from './state/paletteStore'
import { useKeybindings } from './hooks/useKeybindings'
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
  const scopedOrder = useScopedOrder()

  const cycleMode = useLayoutStore((s) => s.cycleMode)
  const setExperimentalEnabled = useLayoutStore((s) => s.setExperimentalEnabled)

  const pushNotif = useNotificationStore((s) => s.push)
  const togglePalette = usePaletteStore((s) => s.toggle)

  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void window.ws.workspace.list().then((res) => setWorkspaces(res.workspaces))
  }, [setWorkspaces])

  useEffect(() => {
    const unsubscribe = window.ws.session.onFocus(({ sessionId }) => {
      setActive(sessionId)
    })
    return unsubscribe
  }, [setActive])

  useEffect(() => {
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
      if (event.kind === 'error') toast.error(title, { description })
      else if (event.kind === 'user-input-required' || event.kind === 'permission-prompt')
        toast.warning(title, { description })
      else toast.success(title, { description })
    })
    return unsubscribe
  }, [pushNotif])

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
      addSession({
        id: res.sessionId,
        workspaceId: activeWorkspaceId,
        type,
        label: res.label,
        state: 'idle',
        hasUnseenWaiting: false,
      })
    },
    [activeWorkspaceId, addSession],
  )

  const cycleWorkspace = useCallback(
    (direction: 1 | -1) => {
      if (workspaces.length === 0) return
      const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId)
      const nextIdx = idx === -1 ? 0 : (idx + direction + workspaces.length) % workspaces.length
      const next = workspaces[nextIdx]
      if (next) setActiveWorkspace(next.id)
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
      if (next) setActive(next)
    },
    [scopedOrder, activeId, setActive],
  )

  useKeybindings({
    cycleSessionNext: () => cycleSession(1),
    cycleSessionPrev: () => cycleSession(-1),
    jumpToSession: (i) => {
      const id = scopedOrder[i]
      if (id) setActive(id)
    },
    spawnLastUsed: () => void spawnLastUsed(lastUsedType),
    killActive: () => {
      if (activeId) void window.ws.session.kill({ sessionId: activeId })
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
    cycleLayout: cycleMode,
  })

  return (
    <div className="flex h-screen w-screen bg-bg text-fg">
      <WorkspaceSidebar settingsOpen={settingsOpen} onSettingsToggle={() => setSettingsOpen((v) => !v)} />

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center justify-between border-b border-border bg-bg-sunken px-3 py-1.5 text-xs">
          <span className="font-semibold tracking-tight">ClaudeWorkspace</span>
          <LayoutSwitcher />
        </header>
        <SessionTabs />
        <div className="flex-1 overflow-hidden">
          <PaneMosaic />
        </div>
        <footer className="flex items-center justify-between border-t border-border bg-bg-sunken px-3 py-1 text-[10px] text-muted">
          <span>Ctrl+K palette · Ctrl+1–9 focus · Ctrl+\ layout · Ctrl+T new {lastUsedType}</span>
          <span>
            {scopedOrder.length} session{scopedOrder.length === 1 ? '' : 's'}
          </span>
        </footer>
      </div>

      {settingsOpen && activeWorkspaceId && (
        <SettingsPanel workspaceId={activeWorkspaceId} onClose={() => setSettingsOpen(false)} />
      )}

      <CommandPalette />
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
