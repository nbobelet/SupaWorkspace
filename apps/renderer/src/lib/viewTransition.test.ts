import { afterEach, describe, expect, it, vi } from 'vitest'
import { withViewTransition } from './viewTransition'

const originalDocument = globalThis.document
const originalWindow = globalThis.window

afterEach(() => {
  ;(globalThis as { document?: unknown }).document = originalDocument
  ;(globalThis as { window?: unknown }).window = originalWindow
})

describe('withViewTransition', () => {
  it('runs callback inline when document is undefined', () => {
    ;(globalThis as { document?: unknown }).document = undefined
    const cb = vi.fn()
    withViewTransition(cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('runs callback inline when prefers-reduced-motion is set', () => {
    const cb = vi.fn()
    ;(globalThis as { window?: unknown }).window = {
      matchMedia: () => ({ matches: true }),
    }
    ;(globalThis as { document?: unknown }).document = {
      startViewTransition: vi.fn(),
    }
    withViewTransition(cb)
    expect(cb).toHaveBeenCalledTimes(1)
    const docMock = (globalThis as unknown as { document: { startViewTransition: ReturnType<typeof vi.fn> } }).document
    expect(docMock.startViewTransition).not.toHaveBeenCalled()
  })

  it('runs callback inline when startViewTransition is unavailable', () => {
    const cb = vi.fn()
    ;(globalThis as { window?: unknown }).window = {
      matchMedia: () => ({ matches: false }),
    }
    ;(globalThis as { document?: unknown }).document = {}
    withViewTransition(cb)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('routes through startViewTransition when available and motion allowed', () => {
    const cb = vi.fn()
    const startSpy = vi.fn((fn: () => void) => {
      fn()
    })
    ;(globalThis as { window?: unknown }).window = {
      matchMedia: () => ({ matches: false }),
    }
    ;(globalThis as { document?: unknown }).document = {
      startViewTransition: startSpy,
    }
    withViewTransition(cb)
    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
