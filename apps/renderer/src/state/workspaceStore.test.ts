import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore } from './workspaceStore'

describe('setSubAppExpanded', () => {
  beforeEach(() => {
    useWorkspaceStore.setState({
      workspaces: [],
      activeWorkspaceId: null,
      activeSubAppId: {},
      expandedSubApps: {},
    })
  })

  // Repro: the sidebar mirrors `expandedSubApps` into the local accordion Set
  // via an effect keyed on the store reference. A workspace with no explicit
  // entry resolves sub-app expand through the lazy default (supatty: true), so
  // clicking SupaTTY -> setSubAppExpanded(w, 'supatty', true) compared against
  // the default and returned `prev` unchanged: the store reference never
  // changed, the mirror effect never fired, and the session list stayed
  // collapsed. Activating a default-expanded sub-app must still materialize an
  // explicit entry so subscribers re-render.
  it('materializes an entry on first activate even when the value equals the lazy default', () => {
    const before = useWorkspaceStore.getState().expandedSubApps
    expect(before['w1']).toBeUndefined()

    useWorkspaceStore.getState().setSubAppExpanded('w1', 'supatty', true)

    const after = useWorkspaceStore.getState().expandedSubApps
    expect(after).not.toBe(before)
    expect(after['w1']?.supatty).toBe(true)
  })

  it('is a true no-op when an explicit entry already matches the target', () => {
    useWorkspaceStore.setState({
      expandedSubApps: {
        w1: { supatty: true, notes: false, dashboard: false, explorer: false },
      },
    })
    const before = useWorkspaceStore.getState().expandedSubApps

    useWorkspaceStore.getState().setSubAppExpanded('w1', 'supatty', true)

    expect(useWorkspaceStore.getState().expandedSubApps).toBe(before)
  })

  it('flips an explicit entry from collapsed to expanded', () => {
    useWorkspaceStore.setState({
      expandedSubApps: {
        w1: { supatty: false, notes: false, dashboard: false, explorer: false },
      },
    })

    useWorkspaceStore.getState().setSubAppExpanded('w1', 'supatty', true)

    expect(useWorkspaceStore.getState().expandedSubApps['w1']?.supatty).toBe(true)
  })
})
