export const FOLLOW_THRESHOLD_ROWS = 2

export interface FollowOutputBuffer {
  readonly viewportY: number
  readonly baseY: number
}

export interface FollowOutputTarget {
  readonly buffer: { readonly active: FollowOutputBuffer }
  scrollToBottom(): void
  onScroll(listener: () => void): { dispose: () => void }
}

export function isAtBottom(
  target: FollowOutputTarget,
  threshold: number = FOLLOW_THRESHOLD_ROWS,
): boolean {
  const { baseY, viewportY } = target.buffer.active
  return baseY - viewportY <= threshold
}

export interface FollowController {
  isFollowing(): boolean
  beginWrite(): void
  onWrite(): void
  resync(): void
  subscribe(listener: () => void): () => void
  dispose(): void
}

/**
 * Framework-agnostic follow-output controller for an xterm-like target.
 * Starts in `following = true`. User scroll-up past the threshold pauses
 * follow; scrolling back to bottom resumes it. `resync()` forces follow
 * (used on tab activation or hidden-to-visible transitions).
 */
export function createFollowController(
  target: FollowOutputTarget,
  threshold: number = FOLLOW_THRESHOLD_ROWS,
): FollowController {
  let following = true
  let disposed = false
  let writeDepth = 0
  const listeners = new Set<() => void>()

  const notify = (): void => {
    for (const listener of listeners) listener()
  }

  const setFollowing = (next: boolean): void => {
    if (next === following) return
    following = next
    notify()
  }

  const scrollDisposable = target.onScroll(() => {
    if (disposed || writeDepth > 0) return
    setFollowing(isAtBottom(target, threshold))
  })

  return {
    isFollowing: () => following,
    beginWrite: () => {
      writeDepth++
    },
    onWrite: () => {
      if (disposed) return
      writeDepth = Math.max(0, writeDepth - 1)
      if (writeDepth > 0) return
      const atBottom = isAtBottom(target, threshold)
      setFollowing(atBottom)
      if (atBottom) target.scrollToBottom()
    },
    resync: () => {
      if (disposed) return
      target.scrollToBottom()
      setFollowing(true)
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    dispose: () => {
      if (disposed) return
      disposed = true
      scrollDisposable.dispose()
      listeners.clear()
    },
  }
}
