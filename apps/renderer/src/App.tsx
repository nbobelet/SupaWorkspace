import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { PaneMosaic } from './components/PaneMosaic'
import { WorkspaceSidebar } from './components/WorkspaceSidebar'
import { SessionTabs } from './components/SessionTabs'
import { LayoutSwitcher } from './components/LayoutSwitcher'
import { SettingsPanel } from './components/settings/SettingsPanel'
import { useSessionStore } from './state/sessionStore'
import { useWorkspaceStore } from './state/workspaceStore'
import { useLayoutStore } from './state/layoutStore'
import type { SessionType } from '@shared/session'

export function App(): ReactElement {
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const order = useSessionStore((s) => s.order)
  const setActive = useSessionStore((s) => s.setActive)
  const addSession = useSessionStore((s) => s.addSession)
  const lastUsedType = useSessionStore((s) => s.lastUsedType)

  const cycleMode = useLayoutStore((s) => s.cycleMode)
  const setExperimentalEnabled = useLayoutStore((s) => s.setExperimentalEnabled)

  const [settingsOpen, setSettingsOpen] = useState(false)

  useEffect(() => {
    void window.ws.workspace.list().then((res) => setWorkspaces(res.workspaces))
  }, [setWorkspaces])

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

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.ctrlKey && !e.altKey) {
        if (e.shiftKey && (e.key === 'T' || e.key === 't')) {
          e.preventDefault()
          void spawnLastUsed(lastUsedType)
          return
        }
        if (!e.shiftKey && e.key === '\\') {
          e.preventDefault()
          cycleMode()
          return
        }
        if (!e.shiftKey && /^[1-9]$/.test(e.key)) {
          const idx = Number.parseInt(e.key, 10) - 1
          const id = order[idx]
          if (id) {
            e.preventDefault()
            setActive(id)
          }
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order, setActive, cycleMode, spawnLastUsed, lastUsedType])

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
          <span>Ctrl+1–9 focus · Ctrl+\ cycle layout · Ctrl+Shift+T new {lastUsedType}</span>
          <span>{order.length} session{order.length === 1 ? '' : 's'}</span>
        </footer>
      </div>

      {settingsOpen && activeWorkspaceId && (
        <SettingsPanel workspaceId={activeWorkspaceId} onClose={() => setSettingsOpen(false)} />
      )}
    </div>
  )
}
