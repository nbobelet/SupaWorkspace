import { useEffect, type ReactElement } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { useNotesStore } from '../../state/notesStore'

interface NotesTabProps {
  workspaceId: string
}

export function NotesTab({ workspaceId }: NotesTabProps): ReactElement {
  const content = useNotesStore((s) => s.byWorkspace[workspaceId] ?? '')
  const loaded = useNotesStore((s) => s.loadedFor[workspaceId] === true)
  const setContent = useNotesStore((s) => s.setContent)
  const load = useNotesStore((s) => s.load)

  useEffect(() => {
    void load(workspaceId)
  }, [load, workspaceId])

  if (!loaded) {
    return <p className="text-xs text-muted">Loading notes…</p>
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs text-muted">
        Notes personnelles — scoped to this workspace. Auto-saved 500ms after you stop typing.
      </p>
      <div className="flex-1 overflow-hidden rounded-sm border border-border bg-bg">
        <CodeMirror
          value={content}
          onChange={(v) => setContent(workspaceId, v)}
          height="100%"
          theme="dark"
          extensions={[markdown(), EditorView.lineWrapping]}
          basicSetup={{
            lineNumbers: true,
            highlightActiveLine: true,
            foldGutter: true,
          }}
          style={{ height: '100%', fontSize: 12 }}
        />
      </div>
    </div>
  )
}
