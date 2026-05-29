import type { SubAppId } from '@shared/sub-app'

/**
 * Fixed top-to-bottom order of the sub-app rows under every workspace in the
 * sidebar tree. Single source of truth consumed by `buildWorkspaceTree` — the
 * literal order here IS the rendered order. Kept in its own dependency-free
 * module so the ordering can be regression-tested without dragging in the
 * sidebar's heavy import graph (dnd-kit / xterm).
 */
export const SUB_APP_ORDER: readonly SubAppId[] = ['dashboard', 'supatty', 'explorer', 'notes']
