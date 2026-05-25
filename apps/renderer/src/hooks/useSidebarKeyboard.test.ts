// @vitest-environment jsdom
// jsdom (not node) so the transitive sessionFocus -> useTerminalSession ->
// @xterm/addon-fit import chain finds `self` at module-eval time; the addon's
// UMD wrapper references `self`, which is undefined under the node env.
import { describe, it, expect } from 'vitest'
import type { WorkspaceTreeNode } from '@shared/workspace'
import { flattenVisibleRows, findNextRow } from './useSidebarKeyboard'

// Minimal builders that match the Wave-1 WorkspaceTreeNode contract used by
// the hook (`kind` discriminator + `expanded` flag + `children`/`tabs`).
// Cast through `unknown` is deliberate — the test only exercises the pure
// helpers' duck-typed reads, not the full Zod-validated shape.
function workspace(
  id: string,
  expanded: boolean,
  children: WorkspaceTreeNode[],
): WorkspaceTreeNode {
  return { kind: 'workspace', workspaceId: id, expanded, children } as unknown as WorkspaceTreeNode
}
function subApp(
  workspaceId: string,
  subAppId: 'supatty' | 'notes',
  expanded: boolean,
  tabs: WorkspaceTreeNode[],
): WorkspaceTreeNode {
  return { kind: 'sub-app', workspaceId, subAppId, expanded, tabs } as unknown as WorkspaceTreeNode
}
function tab(sessionId: string): WorkspaceTreeNode {
  return { kind: 'tab', sessionId } as unknown as WorkspaceTreeNode
}

describe('flattenVisibleRows', () => {
  it('respects expanded fields and emits in-order traversal', () => {
    const tree: WorkspaceTreeNode[] = [
      workspace('ws1', true, [
        subApp('ws1', 'supatty', true, [tab('s1'), tab('s2')]),
        subApp('ws1', 'notes', false, []),
      ]),
    ]
    expect(flattenVisibleRows(tree)).toEqual([
      'workspace:ws1',
      'subapp:ws1:supatty',
      'tab:s1',
      'tab:s2',
      'subapp:ws1:notes',
    ])
  })

  it('skips collapsed children', () => {
    const tree: WorkspaceTreeNode[] = [
      workspace('ws1', true, [
        subApp('ws1', 'supatty', false, [tab('s1'), tab('s2')]),
        subApp('ws1', 'notes', false, []),
      ]),
    ]
    const rows = flattenVisibleRows(tree)
    expect(rows).toEqual(['workspace:ws1', 'subapp:ws1:supatty', 'subapp:ws1:notes'])
    expect(rows).not.toContain('tab:s1')
    expect(rows).not.toContain('tab:s2')
  })
})

describe('findNextRow', () => {
  it('wraps at boundary', () => {
    expect(findNextRow(['a', 'b', 'c'], 'c', 1)).toBe('a')
    expect(findNextRow(['a', 'b', 'c'], 'a', -1)).toBe('c')
  })

  it('returns first row when current is null and dir is forward', () => {
    expect(findNextRow(['a', 'b', 'c'], null, 1)).toBe('a')
    expect(findNextRow(['a', 'b', 'c'], null, -1)).toBe('c')
  })
})
