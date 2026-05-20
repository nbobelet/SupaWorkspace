import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { ClaudeSettings } from '@shared/ipc'

interface McpServersEditorProps {
  workspaceId: string
}

interface McpServerDraft {
  name: string
  jsonText: string
  error: string | null
}

export function McpServersEditor({ workspaceId }: McpServersEditorProps): ReactElement {
  const [settings, setSettings] = useState<ClaudeSettings>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<McpServerDraft | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const res = await window.ws.workspace.readSettings(workspaceId)
      setSettings(res.settings)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [workspaceId])

  useEffect(() => {
    void reload()
  }, [reload])

  const servers = (settings.mcpServers ?? {}) as Record<string, unknown>

  const saveServers = useCallback(
    async (next: Record<string, unknown>) => {
      const merged: ClaudeSettings = { ...settings, mcpServers: next }
      try {
        await window.ws.workspace.writeSettings(workspaceId, merged)
        setSettings(merged)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [settings, workspaceId],
  )

  const upsertDraft = useCallback(async () => {
    if (!draft) return
    try {
      const parsed = JSON.parse(draft.jsonText) as unknown
      if (!draft.name.trim()) throw new Error('Server name is required')
      await saveServers({ ...servers, [draft.name.trim()]: parsed })
      setDraft(null)
    } catch (err) {
      setDraft({ ...draft, error: err instanceof Error ? err.message : String(err) })
    }
  }, [draft, saveServers, servers])

  const remove = useCallback(
    async (name: string) => {
      const { [name]: _removed, ...rest } = servers
      await saveServers(rest)
    },
    [saveServers, servers],
  )

  if (loading) return <p className="text-xs text-muted">Loading .claude/settings.json…</p>

  return (
    <div className="flex flex-col gap-2 text-xs">
      {error && (
        <div role="alert" className="rounded-sm border border-error/40 bg-error/10 px-2 py-1 text-error">
          {error}
        </div>
      )}

      <ul className="flex flex-col gap-1">
        {Object.entries(servers).length === 0 && (
          <li className="text-muted">No MCP servers configured for this workspace.</li>
        )}
        {Object.entries(servers).map(([name, value]) => (
          <li key={name} className="flex items-start justify-between gap-2 rounded-sm border border-border bg-bg-elevated p-2">
            <div className="flex-1 overflow-hidden">
              <p className="font-mono text-fg">{name}</p>
              <pre className="supa-scroll mt-1 max-h-24 overflow-y-auto rounded-sm bg-bg p-1 font-mono text-[10px] text-fg-subtle">
                {JSON.stringify(value, null, 2)}
              </pre>
            </div>
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() =>
                  setDraft({ name, jsonText: JSON.stringify(value, null, 2), error: null })
                }
                className="rounded-sm border border-border bg-bg px-2 py-0.5 hover:border-border-strong"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => void remove(name)}
                className="rounded-sm border border-error/40 bg-error/10 px-2 py-0.5 text-error hover:bg-error/20"
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>

      {draft ? (
        <div className="flex flex-col gap-1 rounded-sm border border-border bg-bg-elevated p-2">
          <label className="text-[10px] uppercase text-muted">Server name</label>
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="rounded-sm border border-border bg-bg px-2 py-1 font-mono text-xs outline-none focus:border-accent"
          />
          <label className="mt-1 text-[10px] uppercase text-muted">Config (JSON)</label>
          <textarea
            value={draft.jsonText}
            onChange={(e) => setDraft({ ...draft, jsonText: e.target.value })}
            spellCheck={false}
            rows={8}
            className="rounded-sm border border-border bg-bg p-2 font-mono text-[11px] outline-none focus:border-accent"
          />
          {draft.error && <p className="text-[10px] text-error">{draft.error}</p>}
          <div className="mt-1 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-sm border border-border bg-bg px-2 py-1"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void upsertDraft()}
              className="rounded-sm border border-accent bg-accent/10 px-2 py-1 text-accent hover:bg-accent/20"
            >
              Save
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setDraft({ name: '', jsonText: '{}', error: null })}
          className="self-start rounded-sm border border-border bg-bg-elevated px-2 py-1 hover:border-border-strong"
        >
          + Add MCP server
        </button>
      )}
    </div>
  )
}
