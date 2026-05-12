import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'
import { Terminal, Sparkles } from 'lucide-react'
import { TerminalTypeIcon } from './TerminalTypeIcon'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useScopedOrder, useSessionStore, useHighestPriorityTabId } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useLayoutStore } from '../state/layoutStore'
import { useInlineRename } from '../hooks/useInlineRename'
import { addSessionWithFocus, activateSession } from '../lib/sessionFocus'
import { closeSession } from '../lib/closeSession'
import { getSessionStatus } from '../state/sessionStatus'
import { StatusIcon } from './StatusIcon'
import { TabContextMenu, type TabAction } from './TabContextMenu'
import { scrollTabIntoView } from '../lib/scrollIntoViewX'
import type { SessionType } from '@shared/session'

function truncateMiddle(text: string, maxLen = 40): string {
  if (text.length <= maxLen) return text
  const half = Math.floor((maxLen - 1) / 2)
  return `${text.slice(0, half)}…${text.slice(text.length - half)}`
}

interface ContextMenuState {
  sessionId: string
  x: number
  y: number
}

export function SessionTabs(): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const activeId = useSessionStore((s) => s.activeId)
  const renameSession = useSessionStore((s) => s.renameSession)
  const lastUsedType = useSessionStore((s) => s.lastUsedType)
  const reorderScopedTab = useSessionStore((s) => s.reorderScopedTab)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId)
  const scopedOrder = useScopedOrder()
  const mostUrgentId = useHighestPriorityTabId()
  const setLayoutMode = useLayoutStore((s) => s.setMode)

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    if (activeId) scrollTabIntoView(strip, activeId)
    if (mostUrgentId && mostUrgentId !== activeId) {
      const raf = requestAnimationFrame(() => scrollTabIntoView(strip, mostUrgentId))
      return () => cancelAnimationFrame(raf)
    }
    return undefined
  }, [activeId, mostUrgentId, scopedOrder])

  const rename = useInlineRename(async (id, newLabel) => {
    const existing = sessions[id]
    if (!existing || existing.label === newLabel) return
    try {
      const res = await window.ws.session.rename({ sessionId: id, label: newLabel })
      renameSession(id, res.label)
    } catch (err) {
      console.error('[session] rename failed', err)
    }
  })

  useEffect(() => {
    const handler = (e: Event): void => {
      const detail = (e as CustomEvent<{ sessionId: string }>).detail
      if (!detail?.sessionId) return
      const target = sessions[detail.sessionId]
      if (!target) return
      rename.startRename(detail.sessionId, target.label)
    }
    window.addEventListener('session:rename-request', handler)
    return () => window.removeEventListener('session:rename-request', handler)
  }, [sessions, rename])

  const startRename = useCallback(
    (id: string) => {
      const target = sessions[id]
      if (!target) return
      rename.startRename(id, target.label)
    },
    [sessions, rename],
  )

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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      if (!activeWorkspaceId) return
      const { active, over } = event
      if (!over || active.id === over.id) return
      const from = scopedOrder.indexOf(String(active.id))
      const to = scopedOrder.indexOf(String(over.id))
      if (from === -1 || to === -1) return
      reorderScopedTab(activeWorkspaceId, from, to)
    },
    [activeWorkspaceId, scopedOrder, reorderScopedTab],
  )

  const handleContextMenu = useCallback((event: React.MouseEvent, sessionId: string) => {
    event.preventDefault()
    setMenu({ sessionId, x: event.clientX, y: event.clientY })
  }, [])

  const closeMenu = useCallback(() => setMenu(null), [])

  const handleAction = useCallback(
    async (action: TabAction, sessionId: string) => {
      const target = sessions[sessionId]
      setMenu(null)
      if (!target) return
      switch (action) {
        case 'split-h':
          await activateSession(sessionId)
          if (activeWorkspaceId) setLayoutMode(activeWorkspaceId, 'split-horizontal')
          return
        case 'split-v':
          await activateSession(sessionId)
          if (activeWorkspaceId) setLayoutMode(activeWorkspaceId, 'split-vertical')
          return
        case 'rename':
          startRename(sessionId)
          return
        case 'duplicate':
          if (!activeWorkspaceId) return
          try {
            const res = await window.ws.session.spawn({
              workspaceId: activeWorkspaceId,
              type: target.type,
              cols: 80,
              rows: 24,
            })
            addSessionWithFocus({
              id: res.sessionId,
              workspaceId: activeWorkspaceId,
              type: target.type,
              label: res.label,
              state: 'idle',
            })
          } catch (err) {
            console.error('[session] duplicate failed', err)
          }
          return
        case 'close':
          closeSession(sessionId)
          return
        case 'close-all-ws':
          for (const id of scopedOrder) {
            closeSession(id)
          }
          return
      }
    },
    [sessions, activeWorkspaceId, setLayoutMode, startRename, scopedOrder],
  )

  const wsHue = activeWorkspace?.color?.hue
  const wsPillStyle = wsHue !== undefined ? { background: `oklch(70% 0.15 ${wsHue}deg)` } : undefined

  return (
    <div className="flex items-center gap-1 border-b border-border bg-bg-sunken px-2 py-1 text-xs">
      {activeWorkspace && (
        <div className="mr-2 flex shrink-0 items-center gap-1.5 border-r border-border pr-3">
          {wsHue !== undefined && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={wsPillStyle}
              aria-hidden="true"
            />
          )}
          <span className="truncate font-semibold tracking-tight text-fg" title={activeWorkspace.name}>
            {activeWorkspace.name}
          </span>
        </div>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={scopedOrder} strategy={horizontalListSortingStrategy}>
          <div
            ref={stripRef}
            className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-fg/15 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-fg/30 [&::-webkit-scrollbar-thumb]:transition-colors motion-reduce:[&::-webkit-scrollbar-thumb]:transition-none"
          >
            {scopedOrder.map((id) => {
              const s = sessions[id]
              if (!s) return null
              return (
                <SortableTab
                  key={id}
                  id={id}
                  label={s.label}
                  type={s.type}
                  status={getSessionStatus(s.state)}
                  badgeCount={s.badgeCount}
                  isActive={id === activeId}
                  isMostUrgent={id === mostUrgentId}
                  isRenaming={rename.isRenaming(id)}
                  renameValue={rename.renameValue}
                  onRenameChange={rename.setRenameValue}
                  onRenameCommit={() => void rename.commitRename(id)}
                  onRenameCancel={rename.cancelRename}
                  onActivate={() => {
                    void activateSession(id)
                  }}
                  onStartRename={() => startRename(id)}
                  onClose={() => closeSession(id)}
                  onContextMenu={(e) => handleContextMenu(e, id)}
                />
              )
            })}
          </div>
        </SortableContext>
      </DndContext>

      <div className="ml-3 flex shrink-0 items-center gap-1.5 border-l border-border pl-3">
        <button
          type="button"
          onClick={() => void spawn('shell')}
          disabled={!activeWorkspaceId}
          className="flex h-7 items-center gap-1.5 rounded-md border border-border bg-bg-elevated px-2.5 text-xs font-medium hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          title="New shell (Ctrl+T spawns last-used)"
          aria-label="New shell session"
        >
          <Terminal size={14} aria-hidden="true" />
          <span>Shell</span>
        </button>
        <button
          type="button"
          onClick={() => void spawn('claude')}
          disabled={!activeWorkspaceId}
          className="flex h-7 items-center gap-1.5 rounded-md border border-accent bg-accent/10 px-2.5 text-xs font-medium text-accent hover:bg-accent/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="New Claude session"
        >
          <Sparkles size={14} aria-hidden="true" />
          <span>Claude</span>
        </button>
      </div>

      {activeWorkspace && (
        <span
          className="ml-auto max-w-[40%] truncate font-mono text-[10px] text-muted"
          title={activeWorkspace.rootPath}
        >
          {truncateMiddle(activeWorkspace.rootPath)}
        </span>
      )}
      <span className="ml-2 shrink-0 text-[10px] text-muted">last-used: {lastUsedType}</span>

      {menu && (
        <TabContextMenu
          sessionId={menu.sessionId}
          x={menu.x}
          y={menu.y}
          onAction={(action) => void handleAction(action, menu.sessionId)}
          onClose={closeMenu}
        />
      )}
    </div>
  )
}

interface SortableTabProps {
  id: string
  label: string
  type: SessionType
  status: ReturnType<typeof getSessionStatus>
  badgeCount: number
  isActive: boolean
  isMostUrgent: boolean
  isRenaming: boolean
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameCommit: () => void
  onRenameCancel: () => void
  onActivate: () => void
  onStartRename: () => void
  onClose: () => void
  onContextMenu: (e: React.MouseEvent) => void
}

function SortableTab({
  id,
  label,
  type,
  status,
  badgeCount,
  isActive,
  isMostUrgent,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onActivate,
  onStartRename,
  onClose,
  onContextMenu,
}: SortableTabProps): ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: isRenaming })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const urgentClasses = isMostUrgent
    ? [
        'border-l-4',
        status === 'error'
          ? 'border-l-error ring-1 ring-error/60'
          : 'border-l-warn ring-1 ring-warn/60',
        'motion-safe:scale-[1.02]',
      ].join(' ')
    : ''

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-priority={status}
      data-most-urgent={isMostUrgent ? 'true' : undefined}
      data-session-id={id}
      className={[
        'group flex shrink-0 items-center gap-2 rounded-sm border px-2 py-1 transition-transform',
        isActive
          ? 'border-accent bg-bg-elevated text-fg'
          : 'border-border bg-bg-elevated/40 text-fg-subtle hover:border-border-strong hover:text-fg',
        urgentClasses,
        isDragging ? 'z-10' : '',
      ].join(' ')}
      aria-current={isActive ? 'true' : undefined}
      onContextMenu={onContextMenu}
      {...attributes}
      {...listeners}
    >
      <button
        type="button"
        onClick={() => !isRenaming && onActivate()}
        onDoubleClick={onStartRename}
        className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        aria-label={`${label} session, ${status}${isMostUrgent ? ', most urgent' : ''}`}
      >
        <TerminalTypeIcon type={type} size={12} />
        <StatusIcon status={status} size={12} />
        {badgeCount > 0 && (
          <span
            className="rounded-full bg-accent px-1 text-[10px] font-mono leading-tight text-white"
            aria-label={`${badgeCount} unread notification${badgeCount === 1 ? '' : 's'}`}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </span>
        )}
        {isRenaming && (
          <input
            autoFocus
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit()
              if (e.key === 'Escape') onRenameCancel()
            }}
            onClick={(e) => e.stopPropagation()}
            className="w-32 bg-bg px-1 py-0 font-mono text-xs outline-none ring-1 ring-accent"
            aria-label="Rename session"
          />
        )}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="ml-1 text-muted hover:text-fg"
        aria-label="Close session"
      >
        ×
      </button>
    </div>
  )
}
