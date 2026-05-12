interface ScrollIntoViewCapable {
  scrollIntoView(options?: { block?: ScrollLogicalPosition; inline?: ScrollLogicalPosition; behavior?: ScrollBehavior }): void
}

interface QuerySelectorContainer {
  querySelector(selectors: string): Element | null
}

const SCROLL_OPTIONS = { block: 'nearest', inline: 'nearest', behavior: 'smooth' } as const

/**
 * Scrolls the tab pill matching `data-session-id="<tabId>"` inside `strip`
 * into horizontal view. Silent no-op when the strip or the target is missing,
 * or when the target lacks `scrollIntoView` (older runtime).
 */
export function scrollTabIntoView(strip: QuerySelectorContainer | null, tabId: string): void {
  if (!strip || !tabId) return
  const target = strip.querySelector(`[data-session-id="${cssEscape(tabId)}"]`)
  if (!target) return
  const candidate = target as unknown as Partial<ScrollIntoViewCapable>
  if (typeof candidate.scrollIntoView !== 'function') return
  candidate.scrollIntoView(SCROLL_OPTIONS)
}

function cssEscape(value: string): string {
  if (typeof globalThis !== 'undefined') {
    const css = (globalThis as { CSS?: { escape?: (s: string) => string } }).CSS
    if (css && typeof css.escape === 'function') return css.escape(value)
  }
  return value.replace(/["\\]/g, '\\$&')
}
