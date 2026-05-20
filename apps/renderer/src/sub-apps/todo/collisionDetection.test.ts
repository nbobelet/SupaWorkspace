import { closestCenter, type Active, type ClientRect, type DroppableContainer } from '@dnd-kit/core'
import { describe, expect, it } from 'vitest'
import { kanbanCollisionDetection } from './collisionDetection'

type Args = Parameters<typeof kanbanCollisionDetection>[0]

function rect(left: number, top: number, width: number, height: number): ClientRect {
  return { left, top, width, height, right: left + width, bottom: top + height }
}

function container(id: string): DroppableContainer {
  return { id } as DroppableContainer
}

/**
 * Builds collision args where the dragged overlay's *center* is closest to one
 * droppable (`card-top`) while the *pointer* sits inside another (`card-bottom`).
 * This is the exact geometry that occurs near a column border: closestCenter
 * disagrees with the pointer, so `over` flips on sub-pixel moves → jitter.
 */
function borderArgs(): Args {
  const droppableRects = new Map<string, ClientRect>([
    ['card-top', rect(10, 10, 280, 50)], // center (150, 35)
    ['card-bottom', rect(10, 400, 280, 50)], // center (150, 425)
  ])
  return {
    active: { id: 'dragged' } as Active,
    collisionRect: rect(0, 0, 300, 200), // center (150, 100) — nearest to card-top
    droppableRects,
    droppableContainers: [container('card-top'), container('card-bottom')],
    pointerCoordinates: { x: 150, y: 420 }, // inside card-bottom
  }
}

describe('kanbanCollisionDetection', () => {
  it('follows the pointer near a border instead of the overlay center', () => {
    const args = borderArgs()

    // closestCenter (the old strategy) picks the wrong target → cause of jitter.
    expect(closestCenter(args)[0]?.id).toBe('card-top')

    // The pointer-first strategy resolves to the droppable under the cursor,
    // which stays stable as the cursor moves within it.
    expect(kanbanCollisionDetection(args)[0]?.id).toBe('card-bottom')
  })

  it('falls back to rect/corner detection when the pointer is outside all droppables (keyboard sensor)', () => {
    const args: Args = {
      active: { id: 'dragged' } as Active,
      collisionRect: rect(10, 380, 280, 50), // overlaps card-bottom
      droppableRects: new Map<string, ClientRect>([
        ['card-top', rect(10, 10, 280, 50)],
        ['card-bottom', rect(10, 400, 280, 50)],
      ]),
      droppableContainers: [container('card-top'), container('card-bottom')],
      pointerCoordinates: null, // keyboard drag — no pointer
    }

    expect(kanbanCollisionDetection(args)[0]?.id).toBe('card-bottom')
  })
})
