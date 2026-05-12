import { beforeEach, describe, expect, it } from 'vitest'
import { useLayoutStore } from './layoutStore'

describe('layoutStore', () => {
  beforeEach(() => {
    useLayoutStore.setState({ modeByWorkspace: {}, experimentalEnabled: false })
  })

  it('returns single as default mode for unset workspaces', () => {
    expect(useLayoutStore.getState().getMode('ws-unknown')).toBe('single')
  })

  it('isolates layout mode per workspace', () => {
    const { setMode, getMode } = useLayoutStore.getState()
    setMode('ws-A', 'split-horizontal')
    setMode('ws-B', 'grid')
    expect(getMode('ws-A')).toBe('split-horizontal')
    expect(getMode('ws-B')).toBe('grid')
    expect(getMode('ws-C')).toBe('single')
  })

  it('cycleMode advances only the target workspace', () => {
    const { setMode, cycleMode, getMode } = useLayoutStore.getState()
    setMode('ws-A', 'single')
    setMode('ws-B', 'grid')
    cycleMode('ws-A')
    expect(getMode('ws-A')).toBe('grid')
    expect(getMode('ws-B')).toBe('grid')
  })

  it('cycleMode wraps around the available modes', () => {
    const { setMode, cycleMode, getMode } = useLayoutStore.getState()
    setMode('ws-A', 'single')
    cycleMode('ws-A')
    cycleMode('ws-A')
    cycleMode('ws-A')
    cycleMode('ws-A')
    expect(getMode('ws-A')).toBe('single')
  })

  it('disabling experimental flag reverts cascade workspaces to single', () => {
    useLayoutStore.setState({ experimentalEnabled: true })
    const { setMode, getMode, setExperimentalEnabled } = useLayoutStore.getState()
    setMode('ws-A', 'cascade')
    setMode('ws-B', 'grid')
    setExperimentalEnabled(false)
    expect(getMode('ws-A')).toBe('single')
    expect(getMode('ws-B')).toBe('grid')
  })
})
