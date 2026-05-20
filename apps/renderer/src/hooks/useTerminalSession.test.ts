import { describe, expect, it, vi } from 'vitest'

// useTerminalSession imports xterm + addons at module load, which require a
// browser DOM. We only want to test the pure `shouldReportResize` helper, so
// stub everything else with no-op modules. CSS side-effect import is also
// stubbed to avoid vitest trying to parse it under jsdom-less node.
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }))
vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: class {} }))
vi.mock('@xterm/addon-progress', () => ({ ProgressAddon: class {} }))
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: class {} }))
vi.mock('@xterm/xterm/css/xterm.css', () => ({}))
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('@shared/terminal/options', () => ({
  TerminalOptionsZ: { parse: (x: unknown) => x },
}))
vi.mock('../state/sessionStore', () => ({ useSessionStore: { getState: () => ({}) } }))
vi.mock('../state/paneProgressStore', () => ({ usePaneProgressStore: { getState: () => ({ set: vi.fn(), clear: vi.fn() }) } }))
vi.mock('../lib/followOutput', () => ({
  createFollowController: vi.fn(),
  shouldResyncAfterFit: vi.fn(),
}))
vi.mock('../terminal/buildAddons', () => ({ buildAddons: vi.fn(() => []), buildClipboardAddon: vi.fn() }))
vi.mock('../terminal/buildTheme', () => ({ buildTheme: vi.fn() }))
vi.mock('../terminal/markers', () => ({ createMarkerRegistry: vi.fn() }))
vi.mock('./useDesignTokens', () => ({
  readDesignTokens: vi.fn(),
  useDesignTokens: vi.fn(),
}))
vi.mock('./useSettings', () => ({ useSettings: vi.fn() }))

import { shouldForceRefitOnVisibility, shouldReportResize } from './useTerminalSession'

// Regression: PaneMosaic single-mode unmounts the inactive TerminalPane and
// remounts the active one on every tab/workspace switch. The remount triggers
// ResizeObserver even when the layout slot kept the same dimensions, and the
// old code unconditionally called pty.resize → SIGWINCH → shell prompt redraw
// → main-side stateDetector flipped the session to `running`. This helper
// gates the resize IPC on actual cols/rows change so a no-op remount stays
// silent.
describe('shouldReportResize', () => {
  it('reports the first measurement (prev = null)', () => {
    expect(shouldReportResize(null, { cols: 80, rows: 24 })).toBe(true)
  })

  it('skips when dimensions are identical (tab/workspace switch with no layout change)', () => {
    expect(shouldReportResize({ cols: 80, rows: 24 }, { cols: 80, rows: 24 })).toBe(false)
  })

  it('reports when only cols changed', () => {
    expect(shouldReportResize({ cols: 80, rows: 24 }, { cols: 120, rows: 24 })).toBe(true)
  })

  it('reports when only rows changed', () => {
    expect(shouldReportResize({ cols: 80, rows: 24 }, { cols: 80, rows: 40 })).toBe(true)
  })

  it('reports when both changed', () => {
    expect(shouldReportResize({ cols: 80, rows: 24 }, { cols: 120, rows: 40 })).toBe(true)
  })
})

// Regression (repro-first): the FIRST fit ran on a single rAF before font +
// WebGL glyph metrics settled, cropping the bottom row. In single-view mode
// PaneMosaic remounts the active pane into a slot of identical dimensions, so
// the container contentRect never changes and the ResizeObserver never
// re-fires — the crop persisted until a window resize / view switch. The fix
// forces a refit on a `false -> true` visibility flip while leaving the
// pty.resize IPC gated by lastReportedSize (no spurious SIGWINCH). Reverting
// shouldForceRefitOnVisibility to always-false makes the first assertion fail.
describe('shouldForceRefitOnVisibility', () => {
  it('forces a refit on a false -> true visibility transition (single-view remount)', () => {
    expect(shouldForceRefitOnVisibility(false, true)).toBe(true)
  })

  it('does not force a refit when already visible (true -> true)', () => {
    expect(shouldForceRefitOnVisibility(true, true)).toBe(false)
  })

  it('does not force a refit when becoming hidden (true -> false)', () => {
    expect(shouldForceRefitOnVisibility(true, false)).toBe(false)
  })

  it('does not force a refit while staying hidden (false -> false)', () => {
    expect(shouldForceRefitOnVisibility(false, false)).toBe(false)
  })

  it('a forced refit still emits no pty.resize when cols/rows are unchanged (lastReportedSize guard intact)', () => {
    expect(shouldForceRefitOnVisibility(false, true)).toBe(true)
    expect(shouldReportResize({ cols: 80, rows: 24 }, { cols: 80, rows: 24 })).toBe(false)
  })
})
