import { useCallback, useState } from 'react'
import { marqueeHits, rangeSelection, toggleSelection, type CardRect, type Rect } from './selection'

/**
 * A selection is always confined to one column (Windows-Explorer style): the
 * state carries the owning `columnId`, and any gesture targeting a different
 * column resets the selection to that column.
 */
export interface ColumnSelection {
  columnId: string
  ids: ReadonlySet<string>
  /** Last card touched — the pivot for shift-range. */
  anchorId: string | null
}

export interface ColumnSelectionApi {
  selection: ColumnSelection | null
  selectedIdsFor: (columnId: string) => ReadonlySet<string>
  clear: () => void
  toggle: (columnId: string, taskId: string) => void
  selectRange: (columnId: string, orderedIds: readonly string[], targetId: string) => void
  setMarquee: (columnId: string, marquee: Rect, cards: readonly CardRect[]) => void
}

const EMPTY: ReadonlySet<string> = new Set()

export function useColumnSelection(): ColumnSelectionApi {
  const [selection, setSelection] = useState<ColumnSelection | null>(null)

  const selectedIdsFor = useCallback(
    (columnId: string): ReadonlySet<string> =>
      selection && selection.columnId === columnId ? selection.ids : EMPTY,
    [selection],
  )

  const clear = useCallback(() => setSelection(null), [])

  const toggle = useCallback((columnId: string, taskId: string) => {
    setSelection((prev) => {
      const base = prev && prev.columnId === columnId ? prev.ids : EMPTY
      const ids = toggleSelection(base, taskId)
      if (ids.size === 0) return null
      return { columnId, ids, anchorId: taskId }
    })
  }, [])

  const selectRange = useCallback(
    (columnId: string, orderedIds: readonly string[], targetId: string) => {
      setSelection((prev) => {
        const anchor =
          prev && prev.columnId === columnId && prev.anchorId ? prev.anchorId : targetId
        return {
          columnId,
          ids: new Set(rangeSelection(orderedIds, anchor, targetId)),
          anchorId: anchor,
        }
      })
    },
    [],
  )

  const setMarquee = useCallback((columnId: string, marquee: Rect, cards: readonly CardRect[]) => {
    const ids = marqueeHits(marquee, cards)
    setSelection({ columnId, ids: new Set(ids), anchorId: ids[ids.length - 1] ?? null })
  }, [])

  return { selection, selectedIdsFor, clear, toggle, selectRange, setMarquee }
}
