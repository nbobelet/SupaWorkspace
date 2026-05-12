import { useEffect, type ReactElement } from 'react'
import CodeMirror, { EditorView } from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { useNotesStore } from '../../state/notesStore'

export function NotesTab(): ReactElement {
  const content = useNotesStore((s) => s.content)
  const loaded = useNotesStore((s) => s.loaded)
  const setContent = useNotesStore((s) => s.setContent)
  const load = useNotesStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  if (!loaded) {
    return <p className="text-xs text-muted">Loading notes…</p>
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <p className="text-xs text-muted">
        Notes personnelles — shared across all workspaces. Auto-saved 500ms after you stop typing.
      </p>
      <div className="flex-1 overflow-hidden rounded-sm border border-border bg-bg">
        <CodeMirror
          value={content}
          onChange={(v) => setContent(v)}
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
