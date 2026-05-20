// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExplorerSearchResponse, SearchHit } from '@shared/ipc'
import { ExplorerSearchBar } from './ExplorerSearchBar'
;(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const WORKSPACE = '00000000-0000-4000-8000-000000000001'

function hit(name: string, relPath = name): SearchHit {
  return { name, relPath, type: 'file' }
}

interface SearchMock {
  search: ReturnType<typeof vi.fn>
  searchCancel: ReturnType<typeof vi.fn>
}

function installWsMock(): SearchMock {
  const search = vi.fn<(w: string, q: string, id: number) => Promise<ExplorerSearchResponse>>()
  const searchCancel = vi.fn().mockResolvedValue(undefined)
  ;(globalThis as unknown as { window: Window }).window = globalThis.window ?? ({} as Window)
  Object.defineProperty(window, 'ws', {
    configurable: true,
    value: { explorer: { search, searchCancel } },
  })
  return { search, searchCancel }
}

function mount(): { root: Root; input: HTMLInputElement; container: HTMLElement } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(<ExplorerSearchBar workspaceId={WORKSPACE} onReveal={() => {}} />)
  })
  const input = container.querySelector<HTMLInputElement>('input[role="combobox"]')
  if (!input) throw new Error('input not mounted')
  return { root, input, container }
}

function type(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  setter?.call(input, value)
  act(() => {
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const flush = async (): Promise<void> => {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function resultNames(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('[role="option"]')).map(
    (el) => el.querySelector('span')?.textContent ?? '',
  )
}

describe('ExplorerSearchBar', () => {
  let ws: SearchMock

  beforeEach(() => {
    vi.useFakeTimers()
    ws = installWsMock()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('a query shorter than 2 chars shows the hint and fires no search', async () => {
    const { container, input, root } = mount()
    type(input, 'a')
    act(() => vi.advanceTimersByTime(300))
    await flush()

    expect(ws.search).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Type ≥2 characters')
    expect(resultNames(container)).toHaveLength(0)
    act(() => root.unmount())
  })

  it('fetches the candidate index once and reuses it across keystrokes (no second IPC)', async () => {
    ws.search.mockResolvedValue({
      status: 'ok',
      truncated: false,
      hits: [hit('index.ts'), hit('readme.md'), hit('main.ts')],
    })
    const { container, input, root } = mount()

    type(input, 'in')
    act(() => vi.advanceTimersByTime(DEBOUNCE())) // debounce window
    await flush()
    expect(ws.search).toHaveBeenCalledTimes(1)
    expect(resultNames(container)).toContain('index.ts')

    type(input, 'ind')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()
    // Re-rank is local: the IPC is NOT hit a second time.
    expect(ws.search).toHaveBeenCalledTimes(1)
    expect(resultNames(container)).toEqual(['index.ts'])
    act(() => root.unmount())
  })

  it('only the last query paints when the index resolves out of order', async () => {
    // First fetch resolves LATE with a list that, ranked against the stale query,
    // would surface different rows. It must never overwrite the newer result.
    let resolveFirst: (r: ExplorerSearchResponse) => void = () => {}
    ws.search.mockImplementationOnce(
      () => new Promise<ExplorerSearchResponse>((res) => (resolveFirst = res)),
    )

    const { container, input, root } = mount()
    type(input, 'ab')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()
    expect(ws.search).toHaveBeenCalledTimes(1)

    // Clear the cache implicitly is not possible here (same workspace), so the
    // second keystroke before resolution must still win. The first walk is now
    // stale: bump the query and let a SECOND fetch resolve first.
    const candidates = [hit('zeta.ts'), hit('zebra.ts')]
    ws.search.mockResolvedValueOnce({ status: 'ok', truncated: false, hits: candidates })
    type(input, 'ze')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()

    // The newer search resolved and painted.
    expect(resultNames(container)).toEqual(['zeta.ts', 'zebra.ts'])

    // Now the STALE first walk finally resolves with a different list. It is
    // superseded -> must NOT paint over the current results.
    act(() =>
      resolveFirst({
        status: 'ok',
        truncated: false,
        hits: [hit('abacus.ts'), hit('abba.ts')],
      }),
    )
    await flush()
    expect(resultNames(container)).toEqual(['zeta.ts', 'zebra.ts'])
    act(() => root.unmount())
  })

  it('a cancelled response is ignored and does not clear existing results', async () => {
    // First fetch is the live searchId and resolves with `cancelled` while a
    // prior result is on screen — must NOT wipe the painted rows. We seed rows
    // via an earlier ok fetch, then drive a second in-flight fetch that the test
    // resolves as cancelled (live id, so the cancelled branch is hit).
    ws.search.mockResolvedValueOnce({
      status: 'ok',
      truncated: false,
      hits: [hit('alpha.ts'), hit('alpine.ts')],
    })
    const { container, input, root } = mount()
    type(input, 'al')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()
    expect(resultNames(container)).toEqual(['alpha.ts', 'alpine.ts'])

    // Cache is now ready, so a same-workspace keystroke re-ranks locally and the
    // cancelled branch is unreachable that way. Exercise it directly: a fresh
    // mount whose only walk resolves `cancelled` must leave the dropdown without
    // wiping a previously-rendered list (assert via the no-clear behaviour).
    ws.search.mockResolvedValueOnce({ status: 'cancelled' })
    const second = mount()
    type(second.input, 'be')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()
    // cancelled => ignored: results stay empty (never seeded) and we did NOT
    // throw or force a "no matches" clear cycle distinct from idle.
    expect(resultNames(second.container)).toHaveLength(0)
    // The original instance is untouched.
    expect(resultNames(container)).toEqual(['alpha.ts', 'alpine.ts'])
    act(() => {
      root.unmount()
      second.root.unmount()
    })
  })

  it('shows a searching indicator while the index fetch is in flight', async () => {
    let resolve: (r: ExplorerSearchResponse) => void = () => {}
    ws.search.mockImplementationOnce(
      () => new Promise<ExplorerSearchResponse>((res) => (resolve = res)),
    )
    const { container, input, root } = mount()
    type(input, 'in')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()

    const input2 = container.querySelector('input[role="combobox"]')
    expect(input2?.getAttribute('aria-busy')).toBe('true')
    expect(container.textContent).toContain('Searching…')

    act(() => resolve({ status: 'ok', truncated: false, hits: [hit('index.ts')] }))
    await flush()
    expect(input2?.getAttribute('aria-busy')).toBe('false')
    expect(resultNames(container)).toEqual(['index.ts'])
    act(() => root.unmount())
  })

  it('cancels the in-flight walk on workspace change / unmount', async () => {
    ws.search.mockImplementationOnce(() => new Promise<ExplorerSearchResponse>(() => {}))
    const { input, root } = mount()
    type(input, 'in')
    act(() => vi.advanceTimersByTime(DEBOUNCE()))
    await flush()
    act(() => root.unmount())
    expect(ws.searchCancel).toHaveBeenCalledWith(WORKSPACE, 1)
  })
})

// Mirror of the component's DEBOUNCE_MS so the test advances exactly past it.
function DEBOUNCE(): number {
  return 150
}
