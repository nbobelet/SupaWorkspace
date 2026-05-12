import { useCallback } from 'react'
import { toast } from 'sonner'
import { useWorkspaceStore } from '../state/workspaceStore'

export function useOpenWorkspace(): () => Promise<void> {
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const setActiveWorkspace = useWorkspaceStore((s) => s.setActiveWorkspace)

  return useCallback(async () => {
    const res = await window.ws.workspace.open()
    if (res.workspace) {
      upsertWorkspace(res.workspace)
      setActiveWorkspace(res.workspace.id)
      if (res.wasExisting) {
        toast.info(`Already open as "${res.workspace.name}"`, {
          description: 'Switched to the existing workspace.',
        })
      }
    }
  }, [upsertWorkspace, setActiveWorkspace])
}
