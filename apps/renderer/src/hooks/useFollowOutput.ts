import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import {
  createFollowController,
  type FollowController,
  type FollowOutputTarget,
} from '../lib/followOutput'

interface UseFollowOutput {
  isFollowing: boolean
  onWrite: () => void
  resync: () => void
}

/**
 * React bridge over `createFollowController`. Builds one controller per
 * (target identity) and exposes `isFollowing` as a reactive value.
 * Pass `null` when no target is mounted yet — the hook returns no-op
 * callbacks and `isFollowing = true` until a target appears.
 */
export function useFollowOutput(target: FollowOutputTarget | null): UseFollowOutput {
  const controllerRef = useRef<FollowController | null>(null)
  const targetRef = useRef<FollowOutputTarget | null>(null)

  if (target && target !== targetRef.current) {
    controllerRef.current?.dispose()
    controllerRef.current = createFollowController(target)
    targetRef.current = target
  } else if (!target && controllerRef.current) {
    controllerRef.current.dispose()
    controllerRef.current = null
    targetRef.current = null
  }

  useEffect(() => {
    return () => {
      controllerRef.current?.dispose()
      controllerRef.current = null
      targetRef.current = null
    }
  }, [])

  const store = useMemo(() => {
    void target
    return {
      subscribe: (listener: () => void): (() => void) => {
        const controller = controllerRef.current
        if (!controller) return () => undefined
        return controller.subscribe(listener)
      },
      getSnapshot: (): boolean => controllerRef.current?.isFollowing() ?? true,
    }
  }, [target])

  const isFollowing = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)

  return {
    isFollowing,
    onWrite: () => controllerRef.current?.onWrite(),
    resync: () => controllerRef.current?.resync(),
  }
}
