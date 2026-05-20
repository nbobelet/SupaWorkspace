export interface SubAppRowState {
  isActiveWorkspace: boolean
  isActiveSubApp: boolean
  isExpanded: boolean
  hasChildren: boolean
}

/**
 * Pure background-class decision for a sidebar sub-app row.
 *
 * Two orthogonal signals collapse to one class:
 *  - `isActiveSubApp` — the active sub-app of the *active* workspace. Strongest
 *    visual (solid `bg-bg-elevated`), plus the accent border-l bar at the
 *    call-site.
 *  - "self active" structural anchor — an expanded, child-bearing sub-app
 *    (`isExpanded && hasChildren`) gets a softer `bg-bg-elevated/60`.
 *
 * Both highlights are gated on `isActiveWorkspace`. Without that gate the
 * structural anchor leaks: SupaTTY is the always-expanded, session-bearing
 * sub-app, so every *inactive* expanded workspace painted its SupaTTY row
 * `bg-bg-elevated/60` and looked selected when it wasn't.
 */
export function subAppRowBgClass(state: SubAppRowState): string {
  const isActiveSubApp = state.isActiveWorkspace && state.isActiveSubApp
  const isSelfActive = state.isActiveWorkspace && state.isExpanded && state.hasChildren
  if (isActiveSubApp) return 'bg-bg-elevated text-fg'
  if (isSelfActive) return 'bg-bg-elevated/60 text-fg'
  return 'text-fg-subtle hover:bg-bg-elevated/40'
}
