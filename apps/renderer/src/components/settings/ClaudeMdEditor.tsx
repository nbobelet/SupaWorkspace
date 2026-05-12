import { useCallback, useEffect, useState, type ReactElement } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { useSessionStore } from '../../state/sessionStore'

interface ClaudeMdEditorProps {
  workspaceId: string
}

export function ClaudeMdEditor({ workspaceId }: ClaudeMdEditorProps): ReactElement {
  const [content, setContent] = useState('')
  const [savedContent, setSavedContent] = useState('')
  const [exists, setExists] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sessions = useSessionStore((s) => s.sessions)
  const runningClaudeSessions = Object.values(sessions).filter(
    (s) => s.workspaceId === workspaceId && s.type === 'claude' && s.state !== 'ending',
  )

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.ws.workspace
      .readClaudeMd(workspaceId)
      .then((res) => {
        if (cancelled) return
        setContent(res.content)
        setSavedContent(res.content)
        setExists(res.exists)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const save = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await window.ws.workspace.writeClaudeMd(workspaceId, content)
      setSavedContent(content)
      setExists(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }, [content, workspaceId])

  const dirty = content !== savedContent
  const affectsRunning = dirty && runningClaudeSessions.length > 0

  if (loading) {
    return <p className="text-xs text-muted">Loading CLAUDE.md…</p>
  }

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">
          {exists ? 'CLAUDE.md' : 'CLAUDE.md (new — will be created on save)'}
        </span>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-warn">unsaved</span>}
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="rounded-sm border border-accent bg-accent/10 px-2 py-0.5 text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {affectsRunning && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-sm border border-warn/40 bg-warn/10 px-2 py-1 text-[11px] text-warn"
        >
          {runningClaudeSessions.length} claude session{runningClaudeSessions.length === 1 ? '' : 's'} running —
          changes will apply on next spawn (relaunch to pick them up).
        </div>
      )}

      {error && (
        <div role="alert" className="rounded-sm border border-error/40 bg-error/10 px-2 py-1 text-[11px] text-error">
          {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden rounded-sm border border-border bg-bg">
        <CodeMirror
          value={content}
          onChange={(v) => setContent(v)}
          height="100%"
          theme="dark"
          extensions={[markdown()]}
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
