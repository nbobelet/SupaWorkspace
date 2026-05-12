import { describe, expect, it, vi } from 'vitest'
import { scrollTabIntoView } from './scrollIntoViewX'

interface FakeTarget {
  scrollIntoView: ReturnType<typeof vi.fn>
}

interface FakeStrip {
  querySelector: ReturnType<typeof vi.fn>
}

function makeStrip(target: FakeTarget | null): FakeStrip {
  return {
    querySelector: vi.fn(() => target as unknown as Element | null),
  }
}

describe('scrollTabIntoView', () => {
  it('calls scrollIntoView on the matching tab with smooth nearest options', () => {
    const target: FakeTarget = { scrollIntoView: vi.fn() }
    const strip = makeStrip(target)
    scrollTabIntoView(strip as unknown as HTMLElement, 'abc-123')
    expect(strip.querySelector).toHaveBeenCalledWith('[data-session-id="abc-123"]')
    expect(target.scrollIntoView).toHaveBeenCalledTimes(1)
    expect(target.scrollIntoView).toHaveBeenCalledWith({
      block: 'nearest',
      inline: 'nearest',
      behavior: 'smooth',
    })
  })

  it('is a silent no-op when no tab matches the id', () => {
    const strip = makeStrip(null)
    expect(() => scrollTabIntoView(strip as unknown as HTMLElement, 'missing')).not.toThrow()
    expect(strip.querySelector).toHaveBeenCalledWith('[data-session-id="missing"]')
  })

  it('is a silent no-op when the strip is null', () => {
    expect(() => scrollTabIntoView(null, 'abc')).not.toThrow()
  })

  it('is a silent no-op when the tab id is empty', () => {
    const strip = makeStrip({ scrollIntoView: vi.fn() })
    scrollTabIntoView(strip as unknown as HTMLElement, '')
    expect(strip.querySelector).not.toHaveBeenCalled()
  })

  it('is a silent no-op when the target lacks scrollIntoView', () => {
    const strip = makeStrip({} as unknown as FakeTarget)
    expect(() => scrollTabIntoView(strip as unknown as HTMLElement, 'abc')).not.toThrow()
  })
})
