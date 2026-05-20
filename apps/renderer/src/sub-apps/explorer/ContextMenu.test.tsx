// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FileEntry } from '@shared/ipc'
import { ExplorerContextMenu } from './ContextMenu'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const WORKSPACE = '00000000-0000-4000-8000-000000000001'

function entry(name: string, type: 'file' | 'dir'): FileEntry {
  return { name, path: `/abs/${name}`, type, size: type === 'dir' ? 0 : 10 }
}

interface WsMock {
  open: ReturnType<typeof vi.fn>
  reveal: ReturnType<typeof vi.fn>
}

function installWsMock(): WsMock {
  const open = vi.fn().mockResolvedValue({ opened: true })
  const reveal = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(window, 'ws', {
    configurable: true,
    value: { explorer: { open, reveal, listDir: vi.fn() }, permissions: { requestPath: vi.fn() } },
  })
  return { open, reveal }
}

function mount(node: ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { root, container }
}

function items(container: HTMLElement): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
}

describe('ExplorerContextMenu', () => {
  let ws: WsMock

  beforeEach(() => {
    ws = installWsMock()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders Open + Reveal for a file', () => {
    const { root, container } = mount(
      <ExplorerContextMenu
        workspaceId={WORKSPACE}
        entry={entry('a.ts', 'file')}
        relPath="a.ts"
        position={{ clientX: 10, clientY: 10 }}
        onClose={() => {}}
      />,
    )
    const labels = items(container).map((b) => b.textContent)
    expect(labels).toEqual(['Open', 'Reveal in file manager'])
    act(() => root.unmount())
  })

  it('renders only Reveal for a folder', () => {
    const { root, container } = mount(
      <ExplorerContextMenu
        workspaceId={WORKSPACE}
        entry={entry('src', 'dir')}
        relPath="src"
        position={{ clientX: 10, clientY: 10 }}
        onClose={() => {}}
      />,
    )
    const labels = items(container).map((b) => b.textContent)
    expect(labels).toEqual(['Reveal in file manager'])
    act(() => root.unmount())
  })

  it('clicking Open routes to ws.explorer.open and closes', () => {
    const onClose = vi.fn()
    const { root, container } = mount(
      <ExplorerContextMenu
        workspaceId={WORKSPACE}
        entry={entry('a.ts', 'file')}
        relPath="dir/a.ts"
        position={{ clientX: 10, clientY: 10 }}
        onClose={onClose}
      />,
    )
    act(() => items(container)[0]?.click())
    expect(ws.open).toHaveBeenCalledWith(WORKSPACE, 'dir/a.ts')
    expect(onClose).toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('clicking Reveal routes to ws.explorer.reveal and closes', () => {
    const onClose = vi.fn()
    const { root, container } = mount(
      <ExplorerContextMenu
        workspaceId={WORKSPACE}
        entry={entry('src', 'dir')}
        relPath="src"
        position={{ clientX: 10, clientY: 10 }}
        onClose={onClose}
      />,
    )
    act(() => items(container)[0]?.click())
    expect(ws.reveal).toHaveBeenCalledWith(WORKSPACE, 'src')
    expect(onClose).toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('Escape closes the menu', () => {
    const onClose = vi.fn()
    const { root, container } = mount(
      <ExplorerContextMenu
        workspaceId={WORKSPACE}
        entry={entry('a.ts', 'file')}
        relPath="a.ts"
        position={{ clientX: 10, clientY: 10 }}
        onClose={onClose}
      />,
    )
    const menu = container.querySelector<HTMLElement>('[role="menu"]')
    act(() => {
      menu?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(onClose).toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('outside pointerdown closes the menu', () => {
    const onClose = vi.fn()
    const { root } = mount(
      <ExplorerContextMenu
        workspaceId={WORKSPACE}
        entry={entry('a.ts', 'file')}
        relPath="a.ts"
        position={{ clientX: 10, clientY: 10 }}
        onClose={onClose}
      />,
    )
    act(() => {
      document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    expect(onClose).toHaveBeenCalled()
    act(() => root.unmount())
  })
})
