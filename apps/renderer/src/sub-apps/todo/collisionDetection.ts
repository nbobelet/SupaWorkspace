import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from '@dnd-kit/core'

/**
 * Collision strategy for the kanban board.
 *
 * `closestCenter` ranks droppables by the distance from the dragged overlay's
 * center to each droppable's center. Near a column's top/bottom border the
 * overlay center sits almost equidistant between two droppables, so the winning
 * `over` flips on sub-pixel pointer moves — siblings gain/lose the sortable
 * transform repeatedly and the cards jitter.
 *
 * Pointer detection is binary (the cursor is inside a rect or it isn't), so it
 * stays stable as the cursor moves within a droppable. We prefer it, then fall
 * back to rect-overlap and corner-distance for the keyboard sensor, which has
 * no pointer coordinates.
 */
export const kanbanCollisionDetection: CollisionDetection = (args) => {
  if (args.pointerCoordinates) {
    const pointerCollisions = pointerWithin(args)
    if (pointerCollisions.length > 0) return pointerCollisions
  }

  const intersections = rectIntersection(args)
  if (intersections.length > 0) return intersections

  return closestCorners(args)
}
