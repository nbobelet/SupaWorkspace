import { describe, expect, it, vi } from 'vitest'
import {
  FOLLOW_THRESHOLD_ROWS,
  createFollowController,
  isAtBottom,
  type FollowOutputTarget,
} from './followOutput'

interface FakeTarget extends FollowOutputTarget {
  setPosition(viewportY: number, baseY: number): void
  emitScroll(): void
  scrollToBottom: ReturnType<typeof vi.fn>
}

function makeTarget(initialViewport = 100, initialBase = 100): FakeTarget {
  let viewportY = initialViewport
  let baseY = initialBase
  let listener: (() => void) | null = null

  const target: FakeTarget = {
    buffer: {
      get active() {
        return { viewportY, baseY }
      },
    },
    scrollToBottom: vi.fn(() => {
      viewportY = baseY
    }),
    onScroll: (cb) => {
      listener = cb
      return {
        dispose: () => {
          listener = null
        },
      }
    },
    setPosition: (vy, by) => {
      viewportY = vy
      baseY = by
    },
    emitScroll: () => {
      listener?.()
    },
  }
  return target
}

describe('isAtBottom', () => {
  it('is true when baseY - viewportY <= threshold', () => {
    const t = makeTarget(98, 100)
    expect(isAtBottom(t, FOLLOW_THRESHOLD_ROWS)).toBe(true)
  })

  it('is false when baseY - viewportY > threshold', () => {
    const t = makeTarget(50, 100)
    expect(isAtBottom(t, FOLLOW_THRESHOLD_ROWS)).toBe(false)
  })

  it('respects a custom threshold', () => {
    const t = makeTarget(90, 100)
    expect(isAtBottom(t, 5)).toBe(false)
    expect(isAtBottom(t, 10)).toBe(true)
  })
})

describe('createFollowController', () => {
  it('starts following and pins to bottom on write', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    expect(ctrl.isFollowing()).toBe(true)
    ctrl.onWrite()
    expect(t.scrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('stops following after the user scrolls up past the threshold', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    t.setPosition(50, 100)
    t.emitScroll()
    expect(ctrl.isFollowing()).toBe(false)
    ctrl.onWrite()
    expect(t.scrollToBottom).not.toHaveBeenCalled()
  })

  it('resumes follow when the user scrolls back to the bottom', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    t.setPosition(50, 100)
    t.emitScroll()
    expect(ctrl.isFollowing()).toBe(false)
    t.setPosition(100, 100)
    t.emitScroll()
    expect(ctrl.isFollowing()).toBe(true)
    ctrl.onWrite()
    expect(t.scrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('resync forces follow even after the user scrolled up', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    t.setPosition(50, 100)
    t.emitScroll()
    expect(ctrl.isFollowing()).toBe(false)
    ctrl.resync()
    expect(t.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(ctrl.isFollowing()).toBe(true)
  })

  it('notifies subscribers when the follow flag flips', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    const listener = vi.fn()
    const unsub = ctrl.subscribe(listener)
    t.setPosition(50, 100)
    t.emitScroll()
    expect(listener).toHaveBeenCalledTimes(1)
    t.setPosition(100, 100)
    t.emitScroll()
    expect(listener).toHaveBeenCalledTimes(2)
    unsub()
    t.setPosition(50, 100)
    t.emitScroll()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('dispose unsubscribes the scroll listener', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    ctrl.dispose()
    t.setPosition(50, 100)
    t.emitScroll()
    expect(ctrl.isFollowing()).toBe(true)
    ctrl.onWrite()
    expect(t.scrollToBottom).not.toHaveBeenCalled()
  })

  it('does not force scroll when user scrolls up while writes are in flight', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    ctrl.beginWrite()
    t.setPosition(50, 100)
    t.emitScroll()
    expect(ctrl.isFollowing()).toBe(true)
    ctrl.onWrite()
    expect(ctrl.isFollowing()).toBe(false)
    expect(t.scrollToBottom).not.toHaveBeenCalled()
  })

  it('stays at bottom after batched writes when user did not scroll', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    ctrl.beginWrite()
    ctrl.beginWrite()
    ctrl.beginWrite()
    ctrl.onWrite()
    ctrl.onWrite()
    expect(t.scrollToBottom).not.toHaveBeenCalled()
    ctrl.onWrite()
    expect(t.scrollToBottom).toHaveBeenCalledTimes(1)
    expect(ctrl.isFollowing()).toBe(true)
  })

  it('dispose during write batch does not crash or call scrollToBottom', () => {
    const t = makeTarget()
    const ctrl = createFollowController(t)
    ctrl.beginWrite()
    ctrl.dispose()
    ctrl.onWrite()
    expect(t.scrollToBottom).not.toHaveBeenCalled()
  })
})
