// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileEntry } from '@shared/ipc'
import { MillerColumns, type MillerColumnsProps } from './MillerColumns'
import type { ExplorerColumn } from './useExplorer'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function entry(name: string, type: 'file' | 'dir'): FileEntry {
  return { name, path: `/abs/${name}`, type, size: type === 'dir' ? 0 : 10 }
}

function column(entries: FileEntry[]): ExplorerColumn {
  return { relPath: '', entries, selectedIndex: 0, loading: false }
}

function mount(node: ReactElement): { root: Root; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(node))
  return { root, container }
}

function rows(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"]'))
}

function renderColumns(overrides: Partial<MillerColumnsProps> = {}): {
  root: Root
  container: HTMLElement
  onSelect: ReturnType<typeof vi.fn>
  onActivate: ReturnType<typeof vi.fn>
  onOpenFile: ReturnType<typeof vi.fn>
} {
  const onSelect = vi.fn()
  const onActivate = vi.fn()
  const onOpenFile = vi.fn()
  const { root, container } = mount(
    <MillerColumns
      columns={[column([entry('src', 'dir'), entry('a.ts', 'file')])]}
      metadata={null}
      preview={{ kind: 'idle' }}
      onLoadFull={() => {}}
      onSelect={onSelect}
      onActivate={onActivate}
      onOpenFile={onOpenFile}
      {...overrides}
    />,
  )
  return { root, container, onSelect, onActivate, onOpenFile }
}

describe('MillerColumns row activation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('single click on a folder navigates into it (onActivate, not onSelect)', () => {
    const { root, container, onSelect, onActivate } = renderColumns()
    act(() => rows(container)[0]?.click())
    expect(onActivate).toHaveBeenCalledWith(0, 0)
    expect(onSelect).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('single click on a file selects it (onSelect, not onActivate)', () => {
    const { root, container, onSelect, onActivate } = renderColumns()
    act(() => rows(container)[1]?.click())
    expect(onSelect).toHaveBeenCalledWith(0, 1)
    expect(onActivate).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('double click on a file opens it', () => {
    const { root, container, onOpenFile } = renderColumns()
    act(() => {
      rows(container)[1]?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    })
    expect(onOpenFile).toHaveBeenCalledWith(entry('a.ts', 'file'))
    act(() => root.unmount())
  })
})
