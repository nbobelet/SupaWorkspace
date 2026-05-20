import { describe, expect, it } from 'vitest'
import { subAppRowBgClass } from './subAppRowStyle'

describe('subAppRowBgClass', () => {
  it('paints the active sub-app of the active workspace with the solid elevated bg', () => {
    expect(
      subAppRowBgClass({
        isActiveWorkspace: true,
        isActiveSubApp: true,
        isExpanded: true,
        hasChildren: true,
      }),
    ).toBe('bg-bg-elevated text-fg')
  })

  it('paints the active workspace expanded child-bearing sub-app with the soft anchor bg', () => {
    expect(
      subAppRowBgClass({
        isActiveWorkspace: true,
        isActiveSubApp: false,
        isExpanded: true,
        hasChildren: true,
      }),
    ).toBe('bg-bg-elevated/60 text-fg')
  })

  // Regression: SupaTTY is always expanded + session-bearing, so an inactive
  // workspace's SupaTTY row used to leak `bg-bg-elevated/60` and look selected.
  it('keeps an inactive workspace SupaTTY row transparent even when expanded with children', () => {
    expect(
      subAppRowBgClass({
        isActiveWorkspace: false,
        isActiveSubApp: false,
        isExpanded: true,
        hasChildren: true,
      }),
    ).toBe('text-fg-subtle hover:bg-bg-elevated/40')
  })

  // An active-sub-app flag must never win when the workspace itself is inactive
  // (stale store read across workspaces).
  it('ignores the active-sub-app flag when the workspace is not active', () => {
    expect(
      subAppRowBgClass({
        isActiveWorkspace: false,
        isActiveSubApp: true,
        isExpanded: false,
        hasChildren: false,
      }),
    ).toBe('text-fg-subtle hover:bg-bg-elevated/40')
  })

  it('paints a collapsed leaf-like sub-app transparent', () => {
    expect(
      subAppRowBgClass({
        isActiveWorkspace: true,
        isActiveSubApp: false,
        isExpanded: false,
        hasChildren: false,
      }),
    ).toBe('text-fg-subtle hover:bg-bg-elevated/40')
  })
})
