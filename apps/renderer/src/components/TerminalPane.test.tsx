// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

// xterm pulls WebGL / canvas at import time — mock the whole session hook so
// the component renders in jsdom without a real terminal. The four named
// exports are the surface TerminalPane imports.
vi.mock('../hooks/useTerminalSession', () => ({
  useTerminalSession: vi.fn(),
  getTerminalSelection: vi.fn(() => ''),
  terminalPaste: vi.fn(),
  terminalSelectAll: vi.fn(),
}))

// focusActiveSession schedules a rAF focus-steal on mount when active — no-op
// it so the test only observes the mousedown wiring under inspection.
vi.mock('../lib/sessionFocus', () => ({
  focusActiveSession: vi.fn(),
}))

import { TerminalPane } from './TerminalPane'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mount(node: ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { root, container }
}

function fireMouseDown(el: Element): void {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  })
}

describe('TerminalPane — body mousedown does not hijack the active pane', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  // Repro: with a session already active, clicking inside the terminal body to
  // scroll back / start a selection used to fire onFocus -> activateSession,
  // whose already-active branch resync()->scrollToBottom() snapped the viewport
  // to the bottom (scrollback unreadable, drag-selection wiped — selection is
  // still empty at mousedown so the preserve-selection guard never triggers).
  // The active pane must let xterm handle its own body clicks natively.
  it('does NOT call onFocus when the pane is already active', () => {
    const onFocus = vi.fn()
    const { container } = mount(<TerminalPane sessionId="s1" isActive={true} onFocus={onFocus} />)
    const wrapper = container.querySelector('[data-session-id="s1"]')
    expect(wrapper).not.toBeNull()

    fireMouseDown(wrapper as Element)

    expect(onFocus).not.toHaveBeenCalled()
  })

  // An INACTIVE pane (mosaic background pane, cascade window) still needs the
  // activate-on-mousedown path so a single click brings it to the front.
  it('calls onFocus when the pane is inactive', () => {
    const onFocus = vi.fn()
    const { container } = mount(<TerminalPane sessionId="s2" isActive={false} onFocus={onFocus} />)
    const wrapper = container.querySelector('[data-session-id="s2"]')
    expect(wrapper).not.toBeNull()

    fireMouseDown(wrapper as Element)

    expect(onFocus).toHaveBeenCalledTimes(1)
  })
})
