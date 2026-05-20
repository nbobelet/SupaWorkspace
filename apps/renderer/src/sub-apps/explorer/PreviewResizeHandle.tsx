import type { KeyboardEvent, PointerEvent, ReactElement } from 'react'
import { PREVIEW_MAX_WIDTH, PREVIEW_MIN_WIDTH } from './explorerPreviewStore'

interface PreviewResizeHandleProps {
  /** Current preview width (px) — surfaced as `aria-valuenow`. */
  width: number
  collapsed: boolean
  dragging: boolean
  onPointerDown: (event: PointerEvent<HTMLElement>) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>) => void
}

/**
 * Vertical splitter between the Miller-columns region and the pinned preview.
 * A focusable `separator` — pointer drag resizes, Arrow keys nudge, and (when
 * collapsed) ArrowRight re-opens. Visual is a thin token-colored bar that
 * thickens on hover / focus / active; the hit area is wider than the paint.
 */
export function PreviewResizeHandle({
  width,
  collapsed,
  dragging,
  onPointerDown,
  onKeyDown,
}: PreviewResizeHandleProps): ReactElement {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize preview"
      aria-valuenow={collapsed ? PREVIEW_MIN_WIDTH : width}
      aria-valuemin={PREVIEW_MIN_WIDTH}
      aria-valuemax={PREVIEW_MAX_WIDTH}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={[
        'group relative h-full w-1.5 shrink-0 cursor-col-resize select-none outline-none',
        collapsed ? 'cursor-default' : 'cursor-col-resize',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={[
          'absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors',
          dragging
            ? 'bg-accent'
            : 'bg-border group-hover:bg-accent/60 group-focus-visible:bg-accent',
        ].join(' ')}
      />
    </div>
  )
}
