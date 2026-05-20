/**
 * Pure, DOM-free selection logic for the kanban board. Marquee hit-testing,
 * range computation, and the action-scope dispatcher live here so they can be
 * unit-tested without React or a real DOM. All coordinates are viewport
 * (client) pixels — the same space `getBoundingClientRect()` returns.
 */

/** Axis-aligned rectangle in viewport (client) coordinates. */
export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Point {
  x: number
  y: number
}

/** Normalized rect spanning two drag points, in any corner order. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  }
}

/** True when two AABBs overlap; touching edges count as overlap. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

export interface CardRect {
  id: string
  rect: Rect
}

/** Ids of cards whose rect intersects the marquee, preserving input order. */
export function marqueeHits(marquee: Rect, cards: readonly CardRect[]): string[] {
  return cards.filter((c) => rectsIntersect(marquee, c.rect)).map((c) => c.id)
}

/** Toggle one id in/out of a selection set, immutably. */
export function toggleSelection(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

/**
 * Contiguous range of ids between anchor and target within one column's ordered
 * id list (order-independent endpoints). Confinement to a single column is the
 * caller's responsibility: it only ever passes one column's `orderedIds`, so a
 * range can never span columns. If either endpoint is absent, falls back to the
 * target alone.
 */
export function rangeSelection(
  orderedIds: readonly string[],
  anchorId: string,
  targetId: string,
): string[] {
  const a = orderedIds.indexOf(anchorId)
  const b = orderedIds.indexOf(targetId)
  if (a === -1 || b === -1) return [targetId]
  const [lo, hi] = a <= b ? [a, b] : [b, a]
  return orderedIds.slice(lo, hi + 1)
}

/** Whether a context-menu action fans out to the selection or acts on one card. */
export type ActionScope = 'selection' | 'single'

/**
 * Tasks an action applies to. A selection-capable action fans out to every
 * selected card — but only when the clicked card is itself part of the
 * selection; right-clicking an unselected card always acts on that single card.
 * `single` scope is always the clicked card. No per-action branching lives here,
 * so adding a future bulk action only needs a `scope: 'selection'` entry in the
 * action registry — the dispatcher is untouched.
 */
export function resolveActionTargets(
  scope: ActionScope,
  clickedId: string,
  selection: ReadonlySet<string>,
): string[] {
  if (scope === 'selection' && selection.size > 0 && selection.has(clickedId)) {
    return [...selection]
  }
  return [clickedId]
}
