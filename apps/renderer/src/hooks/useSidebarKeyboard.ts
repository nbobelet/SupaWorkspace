import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { tinykeys, type KeyBindingMap } from 'tinykeys'
import type { WorkspaceTreeNode } from '@shared/workspace'
import { SubAppId } from '@shared/sub-app'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useSessionStore } from '../state/sessionStore'
import { jumpToSession, jumpToWorkspace } from '../lib/sessionFocus'

/**
 * useSidebarKeyboard — keyboard model for the 4-level Workspace sidebar.
 *
 * | Key                | Scope          | Action                                                  |
 * |--------------------|----------------|---------------------------------------------------------|
 * | $mod+Tab           | global         | next tab within current sub-app of active workspace     |
 * | $mod+Shift+Tab     | global         | next sub-app within active workspace (supatty <-> notes)|
 * | ArrowDown          | tree-focused   | focus next visible row                                  |
 * | ArrowUp            | tree-focused   | focus previous visible row                              |
 * | ArrowRight         | tree-focused   | expand collapsed row OR move focus to first child       |
 * | ArrowLeft          | tree-focused   | collapse expanded row OR move focus to parent           |
 * | Enter / Space      | tree-focused   | activate focused row (workspace/tab) or toggle (sub-app)|
 * | Home               | tree-focused   | focus first row                                         |
 * | End                | tree-focused   | focus last visible row                                  |
 *
 * Global bindings respect the same editable-target guard as useKeybindings.ts
 * (skips INPUT/TEXTAREA/SELECT/contenteditable/.xterm). Tree-focused bindings
 * rely on the consumer binding `tabIndex={0}` on the row element and spreading
 * the returned `onKeyDown` handler.
 *
 * Wiring into WorkspaceSidebar.tsx is a follow-up — this hook is wire-ready,
 * not pre-wired. App.tsx still calls useKeybindings(); this hook is a sibling,
 * not a replacement. The $mod+Tab and $mod+Shift+Tab chords are no longer
 * bound by useKeybindings (cycleSessionNext / cycleSessionPrev dropped) —
 * this hook now owns them with sub-app-aware semantics.
 */

/** Opaque row key — `workspace:<wsId>` / `subapp:<wsId>:<subAppId>` / `tab:<sessionId>`. */
export type RowKey = string

export interface TreeKeyHandlers {
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

export interface UseSidebarKeyboardResult {
  focusedRow: RowKey | null
  setFocusedRow: (key: RowKey | null) => void
  getTreeKeyHandlers: (node: WorkspaceTreeNode) => TreeKeyHandlers
}

// Mirrors useKeybindings.ts#isEditableTarget exactly (re-implemented locally
// because the original is not exported and the brief forbids modifying that
// file). Keep these two predicates in sync.
function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.closest('.xterm')) return true
  return false
}

/** Stable key for any tree node. Pure. */
export function rowKeyOf(node: WorkspaceTreeNode): RowKey {
  if (node.kind === 'workspace') return `workspace:${node.workspaceId}`
  if (node.kind === 'sub-app') return `subapp:${node.workspaceId}:${node.subAppId}`
  return `tab:${node.sessionId}`
}

/**
 * Pure in-order traversal of the tree. A node contributes its own RowKey,
 * then — only if `expanded === true` and it has children — the flattened
 * keys of its children. Leaves (tabs) and collapsed branches stop the
 * recursion. The input tree is treated as readonly; no mutation.
 */
export function flattenVisibleRows(tree: readonly WorkspaceTreeNode[]): RowKey[] {
  const out: RowKey[] = []
  for (const node of tree) {
    out.push(rowKeyOf(node))
    if (node.kind === 'tab') continue
    if (!nodeIsExpanded(node)) continue
    const children = nodeChildren(node)
    if (children.length === 0) continue
    out.push(...flattenVisibleRows(children))
  }
  return out
}

/**
 * Wrap-around traversal. `current=null` with `dir=1` returns the first row;
 * with `dir=-1` returns the last row. Empty input returns null.
 */
export function findNextRow(
  rows: readonly RowKey[],
  current: RowKey | null,
  dir: 1 | -1,
): RowKey | null {
  if (rows.length === 0) return null
  if (current === null) {
    const fallback = dir === 1 ? rows[0] : rows[rows.length - 1]
    return fallback ?? null
  }
  const idx = rows.indexOf(current)
  if (idx === -1) {
    const fallback = dir === 1 ? rows[0] : rows[rows.length - 1]
    return fallback ?? null
  }
  const next = (idx + dir + rows.length) % rows.length
  return rows[next] ?? null
}

// ---------------------------------------------------------------------------
// Internal helpers — narrow the WorkspaceTreeNode union via `in` operator
// guards so we never reach for a runtime cast. Wave-1 pins the discriminator
// (`kind`) and the `expanded` field on the non-leaf variants; children live
// on `children` for workspaces and on `tabs` for sub-apps.
// ---------------------------------------------------------------------------

function nodeIsExpanded(node: WorkspaceTreeNode): boolean {
  if (node.kind === 'tab') return false
  if (!('expanded' in node)) return false
  return node.expanded === true
}

function nodeChildren(node: WorkspaceTreeNode): readonly WorkspaceTreeNode[] {
  if (node.kind === 'workspace') {
    if ('children' in node && Array.isArray(node.children)) return node.children
    return []
  }
  if (node.kind === 'sub-app') {
    if ('tabs' in node && Array.isArray(node.tabs)) return node.tabs
    return []
  }
  return []
}

function findParentKey(tree: readonly WorkspaceTreeNode[], target: RowKey): RowKey | null {
  for (const node of tree) {
    if (node.kind === 'tab') continue
    const children = nodeChildren(node)
    for (const child of children) {
      if (rowKeyOf(child) === target) return rowKeyOf(node)
    }
    const deeper = findParentKey(children, target)
    if (deeper !== null) return deeper
  }
  return null
}

function findNodeByKey(
  tree: readonly WorkspaceTreeNode[],
  target: RowKey,
): WorkspaceTreeNode | null {
  for (const node of tree) {
    if (rowKeyOf(node) === target) return node
    if (node.kind === 'tab') continue
    const found = findNodeByKey(nodeChildren(node), target)
    if (found !== null) return found
  }
  return null
}

// ---------------------------------------------------------------------------
// Global cycling — read store state imperatively (no hook subscriptions).
// ---------------------------------------------------------------------------

function cycleTabWithinCurrentSubApp(): void {
  const wsId = useWorkspaceStore.getState().activeWorkspaceId
  if (!wsId) return
  const sessionState = useSessionStore.getState()
  const activeSid = sessionState.activeByWorkspace[wsId] ?? null
  // For the moment every renderer session belongs to the SupaTTY sub-app.
  // When per-tab sub-app routing lands we filter `siblings` on
  // `session.subAppId === activeSubAppOf(wsId)`.
  const siblings: string[] = []
  for (const sid of sessionState.order) {
    const s = sessionState.sessions[sid]
    if (s && s.workspaceId === wsId) siblings.push(sid)
  }
  if (siblings.length <= 1) return
  if (activeSid === null) {
    const first = siblings[0]
    if (first !== undefined) void jumpToSession(first)
    return
  }
  const idx = siblings.indexOf(activeSid)
  if (idx === -1) {
    const first = siblings[0]
    if (first !== undefined) void jumpToSession(first)
    return
  }
  const next = siblings[(idx + 1) % siblings.length]
  if (next !== undefined) void jumpToSession(next)
}

function cycleSubAppWithinCurrentWorkspace(): void {
  const state = useWorkspaceStore.getState()
  const wsId = state.activeWorkspaceId
  if (!wsId) return
  const order = SubAppId.options
  if (order.length <= 1) return
  const current = state.activeSubAppId[wsId] ?? 'supatty'
  const idx = order.indexOf(current)
  const next = order[(idx + 1) % order.length]
  if (next) state.setActiveSubApp(wsId, next)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useSidebarKeyboard(tree: readonly WorkspaceTreeNode[]): UseSidebarKeyboardResult {
  const [focusedRow, setFocusedRow] = useState<RowKey | null>(null)

  // Keep latest tree in a ref so the global tinykeys effect can read fresh
  // data without re-subscribing on every render (subscription churn would
  // race with key events and is wasteful — same trick as the existing
  // capture-phase listener in useKeybindings.ts, just behind a ref so we
  // don't need to re-key the binding map per render).
  const treeRef = useRef<readonly WorkspaceTreeNode[]>(tree)
  treeRef.current = tree

  useEffect(() => {
    const bindings: KeyBindingMap = {
      '$mod+Tab': (event) => {
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        cycleTabWithinCurrentSubApp()
      },
      '$mod+Shift+Tab': (event) => {
        if (isEditableTarget(event.target)) return
        event.preventDefault()
        cycleSubAppWithinCurrentWorkspace()
      },
    }
    // Capture-phase mirrors useKeybindings.ts so xterm.js can't swallow the
    // chord first when an xterm pane has focus.
    return tinykeys(window, bindings, { capture: true })
  }, [])

  function getTreeKeyHandlers(node: WorkspaceTreeNode): TreeKeyHandlers {
    return {
      onKeyDown: (event) => {
        const key = event.key
        const nodeKey = rowKeyOf(node)
        const rows = flattenVisibleRows(treeRef.current)

        if (key === 'ArrowDown') {
          event.preventDefault()
          setFocusedRow(findNextRow(rows, nodeKey, 1))
          return
        }
        if (key === 'ArrowUp') {
          event.preventDefault()
          setFocusedRow(findNextRow(rows, nodeKey, -1))
          return
        }
        if (key === 'Home') {
          event.preventDefault()
          const first = rows[0] ?? null
          setFocusedRow(first)
          return
        }
        if (key === 'End') {
          event.preventDefault()
          const last = rows[rows.length - 1] ?? null
          setFocusedRow(last)
          return
        }
        if (key === 'ArrowRight') {
          event.preventDefault()
          if (node.kind === 'tab') return
          if (!nodeIsExpanded(node)) {
            // Sub-app expand goes through store; workspace expand stays in
            // sidebar local state (no store action yet — keyboard expand of
            // workspace nodes is a known V1 gap, mouse click works).
            if (node.kind === 'sub-app') {
              useWorkspaceStore.getState().toggleSubAppExpanded(node.workspaceId, node.subAppId)
            }
            return
          }
          const children = nodeChildren(node)
          const first = children[0]
          if (first) setFocusedRow(rowKeyOf(first))
          return
        }
        if (key === 'ArrowLeft') {
          event.preventDefault()
          if (node.kind !== 'tab' && nodeIsExpanded(node)) {
            if (node.kind === 'sub-app') {
              useWorkspaceStore.getState().toggleSubAppExpanded(node.workspaceId, node.subAppId)
            }
            return
          }
          const parent = findParentKey(treeRef.current, nodeKey)
          if (parent !== null) setFocusedRow(parent)
          return
        }
        if (key === 'Enter' || key === ' ') {
          event.preventDefault()
          const target = findNodeByKey(treeRef.current, nodeKey) ?? node
          if (target.kind === 'workspace') {
            jumpToWorkspace(target.workspaceId)
          } else if (target.kind === 'tab') {
            void jumpToSession(target.sessionId)
          } else {
            useWorkspaceStore.getState().toggleSubAppExpanded(target.workspaceId, target.subAppId)
          }
          return
        }
      },
    }
  }

  return { focusedRow, setFocusedRow, getTreeKeyHandlers }
}
