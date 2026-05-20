/**
 * A floating popup (column context menu / inline composer) dismisses when an
 * interaction lands outside it. Its OWN events must be ignored — notably a
 * title longer than the composer input scrolls the input's text horizontally,
 * which fires a `scroll` event. Without this containment check that scroll
 * would auto-close the composer mid-typing.
 *
 * Returns true when the event target is outside the popup (→ dismiss). A null
 * popup (not yet mounted) never dismisses.
 */
export function isOutsidePopup(popup: HTMLElement | null, target: EventTarget | null): boolean {
  if (!popup) return false
  if (target instanceof Node && popup.contains(target)) return false
  return true
}
