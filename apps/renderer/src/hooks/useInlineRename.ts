import { useCallback, useState } from 'react'

export interface InlineRenameHandlers {
  renamingId: string | null
  renameValue: string
  setRenameValue: (value: string) => void
  startRename: (id: string, initial: string) => void
  commitRename: (id: string) => Promise<void>
  cancelRename: () => void
  isRenaming: (id: string) => boolean
}

export function useInlineRename(
  onCommit: (id: string, newValue: string) => Promise<void> | void,
): InlineRenameHandlers {
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const startRename = useCallback((id: string, initial: string) => {
    setRenamingId(id)
    setRenameValue(initial)
  }, [])

  const cancelRename = useCallback(() => {
    setRenamingId(null)
  }, [])

  const commitRename = useCallback(
    async (id: string) => {
      const trimmed = renameValue.trim()
      setRenamingId(null)
      if (!trimmed) return
      await onCommit(id, trimmed)
    },
    [renameValue, onCommit],
  )

  const isRenaming = useCallback((id: string) => renamingId === id, [renamingId])

  return {
    renamingId,
    renameValue,
    setRenameValue,
    startRename,
    commitRename,
    cancelRename,
    isRenaming,
  }
}
