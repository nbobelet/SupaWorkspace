import { describe, expect, it } from 'vitest'
import { computeToggleAll } from './workspaceAccordion'

describe('computeToggleAll', () => {
  it('flips to all-expanded when at least one workspace is collapsed', () => {
    const result = computeToggleAll(['w1', 'w2', 'w3'], new Set(['w1']))
    expect(result.allExpanded).toBe(false)
    expect([...result.next].sort()).toEqual(['w1', 'w2', 'w3'])
  })

  it('flips to all-collapsed when every workspace is currently expanded', () => {
    const result = computeToggleAll(['w1', 'w2'], new Set(['w1', 'w2']))
    expect(result.allExpanded).toBe(true)
    expect(result.next.size).toBe(0)
  })

  it('treats fully-collapsed state as not-all-expanded and expands all', () => {
    const result = computeToggleAll(['w1', 'w2'], new Set())
    expect(result.allExpanded).toBe(false)
    expect([...result.next].sort()).toEqual(['w1', 'w2'])
  })

  // Stale ids in `expanded` (workspace removed but still in the Set) must not
  // count toward "all expanded" — the check walks workspaceIds, not the Set.
  it('ignores stale ids in expanded that no longer match a workspace', () => {
    const result = computeToggleAll(['w1', 'w2'], new Set(['w1', 'removed-ws']))
    expect(result.allExpanded).toBe(false)
    expect([...result.next].sort()).toEqual(['w1', 'w2'])
  })

  // Single-workspace sidebar: toggle still works and flips between the
  // singleton expanded/collapsed states.
  it('handles a single workspace', () => {
    const collapsed = computeToggleAll(['w1'], new Set())
    expect(collapsed.allExpanded).toBe(false)
    expect([...collapsed.next]).toEqual(['w1'])

    const expanded = computeToggleAll(['w1'], new Set(['w1']))
    expect(expanded.allExpanded).toBe(true)
    expect(expanded.next.size).toBe(0)
  })

  it('returns a stable empty result for an empty workspace list', () => {
    const result = computeToggleAll([], new Set(['w1']))
    expect(result.allExpanded).toBe(false)
    expect(result.next.size).toBe(0)
  })
})
