export interface ToggleAllResult {
  allExpanded: boolean
  next: Set<string>
}

/**
 * Pure helper for the sidebar's smart "Expand all / Collapse all" toggle.
 *
 * - `allExpanded = true` when every workspace id is present in `expanded`.
 *   Caller uses this to render the button label ("Collapse all" when true,
 *   "Expand all" otherwise).
 * - `next` is the Set to apply on click: empty when currently all expanded
 *   (collapse-all), every workspace id otherwise (expand-all).
 *
 * Edge: empty `workspaceIds` → `allExpanded = false`, `next` empty. The
 * caller is expected to hide the button entirely in that case, but the
 * helper stays well-defined so tests don't depend on a guard at the
 * call-site.
 */
export function computeToggleAll(
  workspaceIds: readonly string[],
  expanded: ReadonlySet<string>,
): ToggleAllResult {
  if (workspaceIds.length === 0) {
    return { allExpanded: false, next: new Set() }
  }
  const allExpanded = workspaceIds.every((id) => expanded.has(id))
  const next = allExpanded ? new Set<string>() : new Set<string>(workspaceIds)
  return { allExpanded, next }
}
