import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { toast } from 'sonner'
import {
  Settings as SettingsIcon,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  FolderPlus,
  ListTodo,
  StickyNote,
  Terminal,
  X,
} from 'lucide-react'
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
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useWorkspaceStore } from '../state/workspaceStore'
import {
  useSessionStore,
  useWorkspaceWorstStatus,
  scopeOrder,
  type RendererSession,
} from '../state/sessionStore'
import { getSessionStatus } from '../state/sessionStatus'
import { useInlineRename } from '../hooks/useInlineRename'
import { useSidebarKeyboard, type RowKey, type TreeKeyHandlers } from '../hooks/useSidebarKeyboard'
import { useActiveSubApp } from '../state/workspaceStore'
import { withViewTransition } from '../lib/viewTransition'
import { clampMenuPosition, VIEWPORT_MARGIN } from '../lib/menuPosition'
import { NotesOverlay } from './NotesOverlay'
import { WorkspaceSettingsMenu } from './WorkspaceSettingsMenu'
import { StatusIcon } from './StatusIcon'
import { TerminalTypeIcon } from './TerminalTypeIcon'
import { jumpToSession, jumpToWorkspace } from '../lib/sessionFocus'
import { closeSession } from '../lib/closeSession'
import { computeToggleAll } from '../lib/workspaceAccordion'
import type { Workspace, WorkspaceTreeNode } from '@shared/workspace'
import type { SubAppId } from '@shared/sub-app'

interface ContextMenuState {
  workspace: Workspace
  x: number
  y: number
}

/**
 * Stable composite key for a sub-app's expanded state inside `expandedIds`.
 * Workspace expansion uses the bare workspace id; sub-app rows use this
 * `workspaceId:subAppId` form so the two namespaces never collide.
 */
function subAppKey(workspaceId: string, subAppId: SubAppId): string {
  return `${workspaceId}:${subAppId}`
}

/**
 * Pure tree builder — projects (`workspaces`, `sessions`, ...) onto the
 * `WorkspaceTreeNode` discriminated union landed in Wave 1. No store reads,
 * no side effects; every input is a parameter so the result is trivially
 * memoizable and unit-testable from a follow-up wave.
 *
 * The `supatty` sub-app receives the workspace's scoped session list as
 * `tab` leaves; the `notes` sub-app is currently leaf-like with no children.
 * The tab node's `status` field carries the raw `SessionState` per the
 * Wave 1 schema — `getSessionStatus` is applied at render time in `TabLeaf`
 * where the matching `exitCode` is also available from the session lookup.
 */
function buildWorkspaceTree(
  workspaces: readonly Workspace[],
  sessions: Readonly<Record<string, RendererSession>>,
  order: readonly string[],
  expandedIds: ReadonlySet<string>,
  activeSessionId: string | null,
): WorkspaceTreeNode[] {
  return workspaces.map<WorkspaceTreeNode>((w) => {
    const scopedIds = scopeOrder([...order], sessions, w.id)
    const supattyChildren: WorkspaceTreeNode[] = []
    for (const sid of scopedIds) {
      const session = sessions[sid]
      if (!session) continue
      supattyChildren.push({
        kind: 'tab',
        workspaceId: w.id,
        subAppId: 'supatty',
        sessionId: session.id,
        active: session.id === activeSessionId,
        status: session.state,
      })
    }
    return {
      kind: 'workspace',
      workspaceId: w.id,
      expanded: expandedIds.has(w.id),
      children: [
        {
          kind: 'sub-app',
          workspaceId: w.id,
          subAppId: 'supatty',
          expanded: expandedIds.has(subAppKey(w.id, 'supatty')),
          children: supattyChildren.filter(
            (node): node is Extract<WorkspaceTreeNode, { kind: 'tab' }> => node.kind === 'tab',
          ),
        },
        {
          kind: 'sub-app',
          workspaceId: w.id,
          subAppId: 'todo',
          expanded: expandedIds.has(subAppKey(w.id, 'todo')),
          children: [],
        },
        {
          kind: 'sub-app',
          workspaceId: w.id,
          subAppId: 'notes',
          expanded: expandedIds.has(subAppKey(w.id, 'notes')),
          children: [],
        },
      ],
    }
  })
}

export function WorkspaceSidebar(): ReactElement {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setWorkspaces = useWorkspaceStore((s) => s.setWorkspaces)
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const removeWorkspace = useWorkspaceStore((s) => s.removeWorkspace)
  const reorderWorkspaces = useWorkspaceStore((s) => s.reorderWorkspaces)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const from = workspaces.findIndex((w) => w.id === active.id)
      const to = workspaces.findIndex((w) => w.id === over.id)
      if (from === -1 || to === -1) return
      reorderWorkspaces(from, to)
    },
    [workspaces, reorderWorkspaces],
  )

  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [settingsOpenFor, setSettingsOpenFor] = useState<string | null>(null)
  const [notesOverlayFor, setNotesOverlayFor] = useState<string | null>(null)
  const setColor = useWorkspaceStore((s) => s.setColor)

  // Accordion expanded state — active workspace starts expanded along with
  // its `supatty` sub-app (the always-populated leaf-bearing sub-app). The
  // set now mixes two key namespaces: bare `workspaceId` for the workspace
  // tile and `workspaceId:subAppId` (via `subAppKey`) for sub-app rows. The
  // header "Expand all / Collapse all" button still operates on workspace
  // ids only — bulk-toggling sub-apps is out of scope.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    if (activeWorkspaceId) {
      initial.add(activeWorkspaceId)
      initial.add(subAppKey(activeWorkspaceId, 'supatty'))
    }
    return initial
  })

  const toggleSubAppExpandedStore = useWorkspaceStore((s) => s.toggleSubAppExpanded)
  const setActiveSubApp = useWorkspaceStore((s) => s.setActiveSubApp)
  const toggleExpand = useCallback(
    (id: string) => {
      // Sub-app keys (`wsId:subAppId`) propagate to the store — single source
      // of truth for sub-app expand state since Wave A. Workspace ids (no
      // colon) stay in the local Set, which still owns workspace-level expand.
      const colon = id.indexOf(':')
      if (colon !== -1) {
        const wsId = id.slice(0, colon)
        const saId = id.slice(colon + 1)
        if (saId === 'supatty' || saId === 'notes' || saId === 'todo') {
          toggleSubAppExpandedStore(wsId, saId)
        }
        return
      }
      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    [toggleSubAppExpandedStore],
  )

  const workspaceIds = useMemo(() => workspaces.map((w) => w.id), [workspaces])
  const toggleAllResult = useMemo(
    () => computeToggleAll(workspaceIds, expandedIds),
    [workspaceIds, expandedIds],
  )
  const toggleAll = useCallback(() => {
    setExpandedIds((prev) => {
      const { next } = computeToggleAll(workspaceIds, prev)
      // Preserve sub-app keys — `computeToggleAll` only knows about workspace
      // ids, so we merge the sub-app entries back in to avoid silently
      // collapsing every sub-app whenever the user clicks "Collapse all".
      for (const key of prev) {
        if (key.includes(':')) next.add(key)
      }
      return next
    })
  }, [workspaceIds])

  const rename = useInlineRename(async (id, newName) => {
    const updated = await window.ws.workspace.rename(id, newName)
    upsertWorkspace(updated)
  })

  // The settings popover keeps its blur-driven close. The right-click context menu
  // owns its own dismissal (Esc / outside-click / scroll / blur) inside <ContextMenu>.
  useEffect(() => {
    const close = (): void => setSettingsOpenFor(null)
    window.addEventListener('blur', close)
    return () => window.removeEventListener('blur', close)
  }, [])

  useEffect(() => {
    const handler = (): void => {
      if (!activeWorkspaceId) return
      const target = workspaces.find((w) => w.id === activeWorkspaceId)
      if (!target) return
      rename.startRename(target.id, target.name)
    }
    window.addEventListener('workspace:rename-active', handler)
    return () => window.removeEventListener('workspace:rename-active', handler)
  }, [activeWorkspaceId, workspaces, rename])

  const openWorkspace = useCallback(async () => {
    const res = await window.ws.workspace.open()
    if (res.workspace) {
      const ws = res.workspace
      withViewTransition(() => {
        upsertWorkspace(ws)
        setActiveWorkspace(ws.id)
      })
      if (res.wasExisting) {
        toast.info(`Already open as "${ws.name}"`, {
          description: 'Switched to the existing workspace.',
        })
      }
    }
  }, [upsertWorkspace, setActiveWorkspace])

  const handleContextMenu = useCallback((e: React.MouseEvent, workspace: Workspace) => {
    e.preventDefault()
    setMenu({ workspace, x: e.clientX, y: e.clientY })
  }, [])

  const startRenameFromMenu = useCallback(
    (workspace: Workspace) => {
      rename.startRename(workspace.id, workspace.name)
      setMenu(null)
    },
    [rename],
  )

  const remove = useCallback(
    async (id: string) => {
      await window.ws.workspace.remove(id)
      removeWorkspace(id)
      const next = await window.ws.workspace.list()
      setWorkspaces(next.workspaces)
      setMenu(null)
    },
    [removeWorkspace, setWorkspaces],
  )

  const reveal = useCallback(async (id: string) => {
    await window.ws.workspace.reveal(id)
    setMenu(null)
  }, [])

  // The tree itself is currently consumed only by `WorkspaceTile` via the
  // `workspaceNode` prop below. Building it at the top of the component (and
  // memoizing it on every dependency that feeds into it) keeps the shape
  // typed end-to-end — the renderer narrows on `kind` rather than mixing
  // store types and ad-hoc inline shapes.
  const sessions = useSessionStore((s) => s.sessions)
  const order = useSessionStore((s) => s.order)
  const activeSessionId = useSessionStore((s) => s.activeId)

  // Sub-app expand lives in the store since Wave A. Mirror it into the local
  // Set so the existing tree builder keeps reading from a single Set without
  // breaking signature. One-way: store → local. UI mouse-click toggles still
  // flow through the local Set (toggleExpand) AND dispatch to the store for
  // colon keys (see below).
  const expandedSubApps = useWorkspaceStore((s) => s.expandedSubApps)
  useEffect(() => {
    setExpandedIds((prev) => {
      const next = new Set<string>()
      for (const key of prev) {
        if (!key.includes(':')) next.add(key)
      }
      for (const [wsId, subapps] of Object.entries(expandedSubApps)) {
        for (const [saId, expanded] of Object.entries(subapps)) {
          if (expanded) next.add(`${wsId}:${saId}`)
        }
      }
      return next
    })
  }, [expandedSubApps])

  const tree = useMemo(
    () => buildWorkspaceTree(workspaces, sessions, order, expandedIds, activeSessionId),
    [workspaces, sessions, order, expandedIds, activeSessionId],
  )

  // Global chords ($mod+Tab cycle tab within sub-app, $mod+Shift+Tab cycle
  // sub-app within workspace) PLUS tree-focused nav (Arrow + Enter MVP)
  // wired via getTreeKeyHandlers spread on SubAppRow / TabLeaf below.
  // Home/End/ArrowLeft/ArrowRight scopes are returned by the hook but the
  // MVP only spreads on the leaf-bearing rows.
  const { focusedRow, getTreeKeyHandlers } = useSidebarKeyboard(tree)

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-bg-sunken">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Workspaces</span>
        <div className="flex items-center gap-1">
          {workspaces.length > 0 && (
            <button
              type="button"
              onClick={toggleAll}
              title={toggleAllResult.allExpanded ? 'Collapse all workspaces' : 'Expand all workspaces'}
              aria-label={toggleAllResult.allExpanded ? 'Collapse all workspaces' : 'Expand all workspaces'}
              aria-pressed={toggleAllResult.allExpanded}
              className="inline-flex items-center rounded-sm border border-border bg-bg-elevated p-1 hover:border-border-strong"
            >
              {toggleAllResult.allExpanded ? (
                <ChevronsDownUp size={14} aria-hidden="true" />
              ) : (
                <ChevronsUpDown size={14} aria-hidden="true" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={openWorkspace}
            title="Open workspace"
            aria-label="Open workspace"
            className="inline-flex items-center rounded-sm border border-border bg-bg-elevated p-1 hover:border-border-strong"
          >
            <FolderPlus size={14} aria-hidden="true" />
          </button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={workspaces.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex-1 overflow-y-auto py-1">
            {workspaces.length === 0 && (
              <li className="px-3 py-2 text-xs text-muted">No workspaces yet. Click &ldquo;Open&rdquo;.</li>
            )}
            {workspaces.map((w, idx) => {
              const node = tree[idx]
              if (!node || node.kind !== 'workspace') return null
              return (
                <WorkspaceTile
                  key={w.id}
                  workspace={w}
                  workspaceNode={node}
                  isActive={w.id === activeWorkspaceId}
                  isExpanded={expandedIds.has(w.id)}
                  onToggleExpand={() => toggleExpand(w.id)}
                  onToggleSubApp={(subAppId) => toggleExpand(subAppKey(w.id, subAppId))}
                  isRenaming={rename.isRenaming(w.id)}
                  renameValue={rename.renameValue}
                  onRenameChange={rename.setRenameValue}
                  onRenameCommit={rename.commitRename}
                  onRenameCancel={rename.cancelRename}
                  onActivate={() => {
                    jumpToWorkspace(w.id)
                  }}
                  onOpenNotes={(workspaceId) =>
                    setNotesOverlayFor((prev) => (prev === workspaceId ? null : workspaceId))
                  }
                  onActivateTodo={(workspaceId) => {
                    setActiveSubApp(workspaceId, 'todo')
                    setActiveWorkspace(workspaceId)
                  }}
                  focusedRow={focusedRow}
                  getTreeKeyHandlers={getTreeKeyHandlers}
                  onContextMenu={handleContextMenu}
                  settingsOpen={settingsOpenFor === w.id}
                  onSettingsToggle={() =>
                    setSettingsOpenFor((prev) => (prev === w.id ? null : w.id))
                  }
                  onStartRename={() => rename.startRename(w.id, w.name)}
                  onChangeColor={(hue) => void setColor(w.id, hue)}
                  onDelete={() => void remove(w.id)}
                />
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: 'Rename', onClick: () => startRenameFromMenu(menu.workspace) },
            { label: 'Reveal in explorer', onClick: () => void reveal(menu.workspace.id) },
            { label: 'Remove from list', onClick: () => void remove(menu.workspace.id), danger: true },
          ]}
        />
      )}
      {notesOverlayFor && (
        <NotesOverlay
          workspaceId={notesOverlayFor}
          onClose={() => setNotesOverlayFor(null)}
        />
      )}
    </aside>
  )
}

interface WorkspaceTileProps {
  workspace: Workspace
  workspaceNode: Extract<WorkspaceTreeNode, { kind: 'workspace' }>
  isActive: boolean
  isExpanded: boolean
  onToggleExpand: () => void
  onToggleSubApp: (subAppId: SubAppId) => void
  isRenaming: boolean
  renameValue: string
  onRenameChange: (value: string) => void
  onRenameCommit: (id: string) => void | Promise<void>
  onRenameCancel: () => void
  onActivate: () => void
  onOpenNotes: (workspaceId: string) => void
  onActivateTodo: (workspaceId: string) => void
  focusedRow: RowKey | null
  getTreeKeyHandlers: (node: WorkspaceTreeNode) => TreeKeyHandlers
  onContextMenu: (e: React.MouseEvent, w: Workspace) => void
  settingsOpen: boolean
  onSettingsToggle: () => void
  onStartRename: () => void
  onChangeColor: (hue: number) => void
  onDelete: () => void
}

function WorkspaceTile({
  workspace: w,
  workspaceNode,
  isActive,
  isExpanded,
  onToggleExpand,
  onToggleSubApp,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  onActivate,
  onOpenNotes,
  onActivateTodo,
  focusedRow,
  getTreeKeyHandlers,
  onContextMenu,
  settingsOpen,
  onSettingsToggle,
  onStartRename,
  onChangeColor,
  onDelete,
}: WorkspaceTileProps): ReactElement {
  const worstStatus = useWorkspaceWorstStatus(w.id)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: w.id,
    disabled: isRenaming,
  })

  const sortableStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  }

  const pillStyle = w.color
    ? { background: `oklch(70% 0.15 ${w.color.hue}deg)` }
    : undefined

  // Narrow the children once so every JSX site below stays type-safe without
  // re-asserting the discriminant.
  const subAppNodes = workspaceNode.children.filter(
    (node): node is Extract<WorkspaceTreeNode, { kind: 'sub-app' }> => node.kind === 'sub-app',
  )

  return (
    <li
      ref={setNodeRef}
      style={sortableStyle}
      className={['group/tile relative', isDragging ? 'z-10' : ''].join(' ')}
      {...attributes}
      {...listeners}
    >
      <div
        data-priority={worstStatus}
        className={[
          'flex w-full items-start gap-2 px-3 py-2 text-left text-sm',
          isActive ? 'bg-bg-elevated text-fg' : 'text-fg-subtle hover:bg-bg-elevated/60',
        ].join(' ')}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          aria-label={isExpanded ? 'Collapse session list' : 'Expand session list'}
          aria-expanded={isExpanded}
          className="mt-1 shrink-0 text-muted hover:text-fg"
        >
          {isExpanded ? (
            <ChevronDown size={12} aria-hidden="true" />
          ) : (
            <ChevronRight size={12} aria-hidden="true" />
          )}
        </button>
        <button
          type="button"
          onClick={() => !isRenaming && onActivate()}
          onContextMenu={(e) => onContextMenu(e, w)}
          className="flex min-w-0 flex-1 items-start gap-2 text-left"
        >
          {w.color ? (
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={pillStyle}
              aria-hidden="true"
            />
          ) : (
            <span className="mt-0.5 text-xs text-muted">●</span>
          )}
          <span className="flex min-w-0 flex-1 flex-col">
            {isRenaming ? (
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => onRenameChange(e.target.value)}
                onBlur={() => void onRenameCommit(w.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onRenameCommit(w.id)
                  if (e.key === 'Escape') onRenameCancel()
                }}
                onClick={(e) => e.stopPropagation()}
                className="bg-bg px-1 py-0.5 text-sm outline-none ring-1 ring-accent"
                aria-label="Rename workspace"
              />
            ) : (
              <span className="truncate font-medium">{w.name}</span>
            )}
            <span className="truncate text-[11px] text-muted" title={w.rootPath}>
              {w.rootPath}
            </span>
          </span>
        </button>
        <span
          className="mt-0.5 flex shrink-0 items-center"
          title={`workspace status: ${worstStatus}`}
        >
          <StatusIcon status={worstStatus} size={14} />
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSettingsToggle()
          }}
          aria-label={`Workspace settings for ${w.name}`}
          aria-expanded={settingsOpen}
          className={[
            'shrink-0 rounded-sm px-1 py-0.5 text-muted hover:text-fg',
            settingsOpen ? 'opacity-100' : 'opacity-0 group-hover/tile:opacity-100 focus-visible:opacity-100',
          ].join(' ')}
          title="Workspace settings"
        >
          <SettingsIcon size={14} aria-hidden="true" />
        </button>
      </div>

      {settingsOpen && (
        <WorkspaceSettingsMenu
          workspace={w}
          onRename={onStartRename}
          onChangeColor={onChangeColor}
          onDelete={onDelete}
          onClose={onSettingsToggle}
        />
      )}

      {/* Sub-app accordion: each workspace exposes two sub-apps (supatty + notes). */}
      <div
        className={[
          'overflow-hidden transition-[max-height] duration-200 ease-in-out',
          isExpanded ? 'max-h-96' : 'max-h-0',
        ].join(' ')}
        aria-hidden={!isExpanded}
      >
        <ul className="pb-1">
          {subAppNodes.map((subAppNode) => (
            <SubAppRow
              key={`${subAppNode.workspaceId}:${subAppNode.subAppId}`}
              workspaceId={subAppNode.workspaceId}
              subAppId={subAppNode.subAppId}
              isExpanded={subAppNode.expanded}
              hasChildren={subAppNode.children.length > 0}
              onToggleExpand={() => onToggleSubApp(subAppNode.subAppId)}
              onActivate={
                subAppNode.subAppId === 'notes'
                  ? () => onOpenNotes(w.id)
                  : subAppNode.subAppId === 'todo'
                    ? () => onActivateTodo(w.id)
                    : undefined
              }
              focused={
                focusedRow === `subapp:${subAppNode.workspaceId}:${subAppNode.subAppId}`
              }
              keyHandlers={getTreeKeyHandlers(subAppNode)}
            >
              {subAppNode.subAppId === 'supatty' && subAppNode.expanded && (
                subAppNode.children.length === 0 ? (
                  <p className="pl-10 pr-2 py-1 text-[11px] text-muted">No sessions</p>
                ) : (
                  <ul>
                    {subAppNode.children.map((tabNode) => (
                      <TabLeaf
                        key={tabNode.sessionId}
                        node={tabNode}
                        focused={focusedRow === `tab:${tabNode.sessionId}`}
                        keyHandlers={getTreeKeyHandlers(tabNode)}
                      />
                    ))}
                  </ul>
                )
              )}
            </SubAppRow>
          ))}
        </ul>
      </div>
    </li>
  )
}

interface SubAppRowProps {
  workspaceId: string
  subAppId: SubAppId
  isExpanded: boolean
  hasChildren: boolean
  onToggleExpand: () => void
  onActivate?: () => void
  focused: boolean
  keyHandlers: TreeKeyHandlers
  children?: React.ReactNode
}

const SUB_APP_LABEL: Record<SubAppId, string> = {
  supatty: 'SupaTTY',
  notes: 'Notes',
  todo: 'TODO',
}

function SubAppRow({
  workspaceId,
  subAppId,
  isExpanded,
  hasChildren,
  onToggleExpand,
  onActivate,
  focused,
  keyHandlers,
  children,
}: SubAppRowProps): ReactElement {
  const label = SUB_APP_LABEL[subAppId]
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const activeSubAppId = useActiveSubApp(workspaceId)
  // Two orthogonal signals: (1) "expanded with children" = structural anchor;
  // (2) "active sub-app of active workspace" = strongest visual (border-l
  // bar via absolute span to avoid layout shift on the 240px sidebar).
  const isActiveSubApp = workspaceId === activeWorkspaceId && subAppId === activeSubAppId
  const isSelfActive = isExpanded && hasChildren
  const rowBgClass = isActiveSubApp
    ? 'bg-bg-elevated text-fg'
    : isSelfActive
      ? 'bg-bg-elevated/60 text-fg'
      : 'text-fg-subtle hover:bg-bg-elevated/40'

  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focused) btnRef.current?.focus()
  }, [focused])

  return (
    <li className="group/subapp" data-workspace-id={workspaceId} data-sub-app-id={subAppId}>
      <div
        className={[
          'relative flex w-full items-center gap-1.5 pl-6 pr-2 py-1 text-left text-xs font-medium',
          rowBgClass,
        ].join(' ')}
      >
        {isActiveSubApp && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 h-full w-[2px] bg-accent"
          />
        )}
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleExpand()
            }}
            aria-label={isExpanded ? `Collapse ${label}` : `Expand ${label}`}
            aria-expanded={isExpanded}
            className="shrink-0 text-muted hover:text-fg"
          >
            {isExpanded ? (
              <ChevronDown size={11} aria-hidden="true" />
            ) : (
              <ChevronRight size={11} aria-hidden="true" />
            )}
          </button>
        ) : (
          // Spacer keeps icon + label alignment identical between sub-apps
          // that have children (chevron-bearing) and leaf-like ones (notes).
          <span className="inline-block w-[11px] shrink-0" aria-hidden="true" />
        )}
        <button
          ref={btnRef}
          type="button"
          onClick={() => {
            if (onActivate) onActivate()
            else if (hasChildren) onToggleExpand()
          }}
          onKeyDown={keyHandlers.onKeyDown}
          tabIndex={focused ? 0 : -1}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        >
          <span className="shrink-0 text-muted">
            {subAppId === 'supatty' ? (
              <Terminal size={12} aria-hidden="true" />
            ) : subAppId === 'todo' ? (
              <ListTodo size={12} aria-hidden="true" />
            ) : (
              <StickyNote size={12} aria-hidden="true" />
            )}
          </span>
          <span className="min-w-0 flex-1 truncate">{label}</span>
        </button>
      </div>
      {children}
    </li>
  )
}

interface TabLeafProps {
  node: Extract<WorkspaceTreeNode, { kind: 'tab' }>
  focused: boolean
  keyHandlers: TreeKeyHandlers
}

function TabLeaf({ node, focused, keyHandlers }: TabLeafProps): ReactElement | null {
  // Tree nodes only carry the discriminator-required fields; richer per-tab
  // state (label, badge, unseen dots, exitCode) lives on the session record
  // in the Zustand store. Looking it up here keeps the tree shape stable
  // and avoids inventing fields outside the Wave 1 schema.
  const session = useSessionStore((s) => s.sessions[node.sessionId])
  const btnRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (focused) btnRef.current?.focus()
  }, [focused])
  if (!session) return null
  const status = getSessionStatus(session.state, session.exitCode)
  const isActiveSession = node.active
  return (
    <li className="group/session">
      <div
        className={[
          'flex w-full items-center gap-1.5 pl-10 pr-2 py-1 text-left text-xs',
          isActiveSession
            ? 'bg-bg-elevated/80 text-fg'
            : 'text-fg-subtle hover:bg-bg-elevated/40',
        ].join(' ')}
      >
        <button
          ref={btnRef}
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          onClick={() => void jumpToSession(session.id)}
          onKeyDown={keyHandlers.onKeyDown}
          tabIndex={focused ? 0 : -1}
        >
          <span className="shrink-0 text-muted">
            <TerminalTypeIcon type={session.type} size={11} />
          </span>
          <span className="min-w-0 flex-1 truncate" title={session.label}>
            {session.label}
          </span>
          {session.hasUnseenAsking && (
            <span
              className="shrink-0 h-1.5 w-1.5 rounded-full bg-warn"
              aria-label="Waiting for input"
            />
          )}
          {session.hasUnseenEnding && (
            <span
              className="shrink-0 h-1.5 w-1.5 rounded-full bg-error"
              aria-label="Session ended"
            />
          )}
          {session.badgeCount > 0 && (
            <span className="rounded-full bg-accent px-1 text-[10px] font-mono leading-tight text-white">
              {session.badgeCount > 9 ? '9+' : session.badgeCount}
            </span>
          )}
          <span className="shrink-0">
            <StatusIcon status={status} size={11} />
          </span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            closeSession(session.id)
          }}
          aria-label={`Close session ${session.label}`}
          className="shrink-0 rounded-sm p-0.5 text-muted opacity-0 hover:text-fg group-hover/session:opacity-100 focus-visible:opacity-100"
        >
          <X size={10} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}

interface ContextMenuProps {
  x: number
  y: number
  onClose: () => void
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>
}

function ContextMenu({ x, y, onClose, items }: ContextMenuProps): ReactElement {
  const ref = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPosition(
      clampMenuPosition({
        x,
        y,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: VIEWPORT_MARGIN,
      }),
    )
  }, [x, y])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    const onPointerDown = (event: PointerEvent): void => {
      const el = ref.current
      if (!el) return
      if (event.target instanceof Node && el.contains(event.target)) return
      onClose()
    }
    const onScroll = (): void => onClose()
    const onBlur = (): void => onClose()
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [onClose])

  return (
    <ul
      ref={ref}
      role="menu"
      style={{ left: position.left, top: position.top }}
      className="fixed z-50 min-w-[160px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg"
    >
      {items.map((item) => (
        <li key={item.label}>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={[
              'block w-full px-3 py-1.5 text-left text-xs',
              item.danger ? 'text-error hover:bg-error/10' : 'text-fg hover:bg-bg',
            ].join(' ')}
          >
            {item.label}
          </button>
        </li>
      ))}
    </ul>
  )
}
