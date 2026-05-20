import { useCallback, useEffect, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { Command } from 'cmdk'
import { usePaletteStore } from '../state/paletteStore'
import { useScopedOrder, useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { addSessionWithFocus } from '../lib/sessionFocus'
import { closeSession } from '../lib/closeSession'
import type { SessionType } from '@shared/session'

export function CommandPalette(): ReactElement | null {
  const open = usePaletteStore((s) => s.open)
  const setOpen = usePaletteStore((s) => s.setOpen)

  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)

  const sessions = useSessionStore((s) => s.sessions)
  const setActiveSession = useSessionStore((s) => s.setActive)
  const activeId = useSessionStore((s) => s.activeId)
  const scopedOrder = useScopedOrder()

  const close = useCallback(() => setOpen(false), [setOpen])

  const spawn = useCallback(
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

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 motion-safe:animate-in motion-safe:fade-in"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mt-24 w-[520px] overflow-hidden rounded-lg border border-border bg-bg-elevated shadow-2xl"
      >
        <Command
          label="Command palette"
          loop
          className="flex flex-col"
        >
          <Command.Input
            autoFocus
            placeholder="Jump to workspace, session, or action…"
            className="border-b border-border bg-transparent px-3 py-2.5 text-sm text-fg outline-none placeholder:text-muted"
          />
          <Command.List className="supa-scroll max-h-80 overflow-y-auto py-1">
            <Command.Empty className="px-3 py-4 text-center text-xs text-muted">
              No results.
            </Command.Empty>

            <Command.Group heading="Actions">
              <PaletteItem
                value="new-shell"
                disabled={!activeWorkspaceId}
                onSelect={() => {
                  void spawn('shell')
                  close()
                }}
              >
                + New shell session
              </PaletteItem>
              <PaletteItem
                value="new-claude"
                disabled={!activeWorkspaceId}
                onSelect={() => {
                  void spawn('claude')
                  close()
                }}
              >
                + New Claude session
              </PaletteItem>
              <PaletteItem
                value="rename-tab"
                disabled={!activeId}
                onSelect={() => {
                  if (!activeId) return
                  window.dispatchEvent(
                    new CustomEvent('session:rename-request', { detail: { sessionId: activeId } }),
                  )
                  close()
                }}
              >
                Rename active tab
              </PaletteItem>
              <PaletteItem
                value="close-tab"
                disabled={!activeId}
                onSelect={() => {
                  if (!activeId) return
                  closeSession(activeId)
                  close()
                }}
              >
                Close active session
              </PaletteItem>
            </Command.Group>

            {scopedOrder.length > 0 && (
              <Command.Group heading="Sessions (current workspace)">
                {scopedOrder.map((id) => {
                  const s = sessions[id]
                  if (!s) return null
                  return (
                    <PaletteItem
                      key={id}
                      value={`session-${id}-${s.label}`}
                      onSelect={() => {
                        setActiveSession(id)
                        close()
                      }}
                    >
                      <span className="font-mono">{s.label}</span>
                      <span className="ml-2 text-[10px] text-muted">{s.type}</span>
                    </PaletteItem>
                  )
                })}
              </Command.Group>
            )}

            {workspaces.length > 0 && (
              <Command.Group heading="Workspaces">
                {workspaces.map((w) => (
                  <PaletteItem
                    key={w.id}
                    value={`workspace-${w.id}-${w.name}-${w.rootPath ?? w.workdir ?? ''}`}
                    onSelect={() => {
                      setActiveWorkspace(w.id)
                      close()
                    }}
                  >
                    <span>{w.name}</span>
                    <span className="ml-2 truncate text-[10px] text-muted">
                      {w.rootPath ?? w.workdir ?? 'global'}
                    </span>
                  </PaletteItem>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>,
    document.body,
  )
}

interface PaletteItemProps {
  value: string
  onSelect: () => void
  disabled?: boolean
  children: React.ReactNode
}

function PaletteItem({ value, onSelect, disabled, children }: PaletteItemProps): ReactElement {
  return (
    <Command.Item
      value={value}
      disabled={disabled}
      onSelect={() => {
        if (disabled) return
        onSelect()
      }}
      className="flex cursor-pointer items-center px-3 py-1.5 text-sm text-fg-subtle aria-selected:bg-bg-sunken aria-selected:text-fg data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50"
    >
      {children}
    </Command.Item>
  )
}
