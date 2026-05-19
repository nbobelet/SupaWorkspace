import type { ReactElement } from 'react'
import { NotesPanel } from '../NotesPanel'

interface NotesTabProps {
  workspaceId: string
}

// Settings-side adapter — keeps the existing settings route entry point
// (`NotesTab`) while the actual editor lives in the reusable `NotesPanel`
// consumed by the sidebar overlay as well.
export function NotesTab({ workspaceId }: NotesTabProps): ReactElement {
  return <NotesPanel workspaceId={workspaceId} />
}
