import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type KeyboardEvent,
} from 'react'
import { clampPreviewWidth, shouldCollapseAt } from './explorerPreviewStore'

/** Keyboard resize step (px) applied per ArrowLeft / ArrowRight on the handle. */
const KEY_STEP = 16

interface UseResizableArgs {
  /** Element whose `--preview-w` custom property the live drag mutates. */
  containerRef: React.RefObject<HTMLElement | null>
  /** Current committed width (px) — the drag anchor. */
  width: number
  collapsed: boolean
  /** Commit a clamped width to the store (on pointer-up / arrow key). */
  onCommit: (px: number) => void
  /** Snap to collapsed (drag dropped below the collapse threshold). */
  onCollapse: () => void
  /** Re-open from collapsed (ArrowRight while collapsed). */
  onExpand: () => void
}

interface UseResizableResult {
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
  dragging: boolean
}

/**
 * Splitter behavior for the pinned preview panel. During a drag the new width
 * is written straight to the container's `--preview-w` CSS variable through a
 * rAF tick — no React state per pointermove (avoids a re-render storm); the
 * store is only touched once, on pointer-up. The handle sits to the LEFT of the
 * preview, so dragging left (decreasing clientX) widens it.
 */
export function useResizable({
  containerRef,
  width,
  collapsed,
  onCommit,
  onCollapse,
  onExpand,
}: UseResizableArgs): UseResizableResult {
  const [dragging, setDragging] = useState(false)
  const frame = useRef<number | null>(null)
  // Live drag state kept in a ref so pointermove never re-renders.
  const drag = useRef<{ startX: number; startWidth: number; latest: number } | null>(null)

  const setVar = useCallback(
    (px: number) => {
      containerRef.current?.style.setProperty('--preview-w', `${px}px`)
    },
    [containerRef],
  )

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      if (collapsed) return
      event.preventDefault()
      event.currentTarget.setPointerCapture(event.pointerId)
      drag.current = { startX: event.clientX, startWidth: width, latest: width }
      setDragging(true)
    },
    [collapsed, width],
  )

  const onPointerMove = useCallback(
    (event: globalThis.PointerEvent) => {
      const state = drag.current
      if (!state) return
      const next = state.startWidth + (state.startX - event.clientX)
      state.latest = next
      if (frame.current !== null) return
      frame.current = requestAnimationFrame(() => {
        frame.current = null
        // Live feedback uses the raw clamp (no viewport cap) so the edge tracks
        // the pointer; the collapse decision happens on release.
        setVar(clampPreviewWidth(state.latest))
      })
    },
    [setVar],
  )

  const endDrag = useCallback(() => {
    const state = drag.current
    drag.current = null
    setDragging(false)
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current)
      frame.current = null
    }
    if (!state) return
    if (shouldCollapseAt(state.latest)) {
      onCollapse()
      return
    }
    const committed = clampPreviewWidth(state.latest, window.innerWidth)
    setVar(committed)
    onCommit(committed)
  }, [onCommit, onCollapse, setVar])

  // Window-level listeners during a drag: pointer capture keeps events flowing
  // to the handle, but binding on window also catches a release outside it.
  useEffect(() => {
    if (!dragging) return
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    window.addEventListener('pointercancel', endDrag)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      window.removeEventListener('pointercancel', endDrag)
    }
  }, [dragging, onPointerMove, endDrag])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        if (collapsed) {
          onExpand()
          return
        }
        onCommit(clampPreviewWidth(width - KEY_STEP, window.innerWidth))
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        if (collapsed) return
        onCommit(clampPreviewWidth(width + KEY_STEP, window.innerWidth))
      }
    },
    [collapsed, width, onCommit, onExpand],
  )

  return { onPointerDown, onKeyDown, dragging }
}
