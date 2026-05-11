import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { ClaudeSettings, PathGrantConflict } from '@shared/ipc'
import type { PathGrant, Workspace } from '@shared/workspace'
import { useWorkspaceStore } from '../../state/workspaceStore'

interface PermissionsManagerProps {
  workspaceId: string
}

type RuleList = 'allow' | 'deny'

export function PermissionsManager({ workspaceId }: PermissionsManagerProps): ReactElement {
  const upsertWorkspace = useWorkspaceStore((s) => s.upsertWorkspace)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const workspace = workspaces.find((w) => w.id === workspaceId)

  const [settings, setSettings] = useState<ClaudeSettings>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newAllow, setNewAllow] = useState('')
  const [newDeny, setNewDeny] = useState('')
  const [conflicts, setConflicts] = useState<PathGrantConflict[]>([])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.ws.workspace
      .readSettings(workspaceId)
      .then((res) => {
        if (!cancelled) setSettings(res.settings)
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

  useEffect(() => {
    let cancelled = false
    void window.ws.permissions
      .grantConflicts()
      .then((res) => {
        if (!cancelled) setConflicts(res.conflicts)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [workspaceId, workspaces])

  const saveRule = useCallback(
    async (list: RuleList, values: string[]) => {
      const merged: ClaudeSettings = {
        ...settings,
        permissions: { ...(settings.permissions ?? {}), [list]: values },
      }
      try {
        await window.ws.workspace.writeSettings(workspaceId, merged)
        setSettings(merged)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [settings, workspaceId],
  )

  const removePathGrant = useCallback(
    async (path: string) => {
      const updated: Workspace = await window.ws.permissions.revokePath({ workspaceId, path })
      upsertWorkspace(updated)
    },
    [workspaceId, upsertWorkspace],
  )

  if (loading) return <p className="text-xs text-muted">Loading permissions…</p>

  const allowList = (settings.permissions?.allow ?? []) as string[]
  const denyList = (settings.permissions?.deny ?? []) as string[]
  const grants: PathGrant[] = workspace?.permissions.extraPaths ?? []

  const relevantConflicts = conflicts.filter((c) =>
    c.workspaces.some((w) => w.id === workspaceId),
  )

  return (
    <div className="flex flex-col gap-3 text-xs">
      {error && (
        <div role="alert" className="rounded-sm border border-error/40 bg-error/10 px-2 py-1 text-error">
          {error}
        </div>
      )}

      {relevantConflicts.length > 0 && (
        <section
          role="status"
          aria-live="polite"
          className="rounded-sm border border-warn/40 bg-warn/10 px-2 py-2 text-warn"
        >
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider">
            Cross-workspace grant conflicts ({relevantConflicts.length})
          </h3>
          <ul className="flex flex-col gap-1">
            {relevantConflicts.map((c) => (
              <li key={c.path} className="text-[11px]">
                <p className="truncate font-mono" title={c.path}>{c.path}</p>
                <p className="text-[10px] text-warn/80">
                  Granted in: {c.workspaces.map((w) => `${w.name} (${w.kind})`).join(', ')}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[10px] text-warn/80">
            Same path granted in multiple workspaces with possibly different kinds. Revoke duplicates to keep scopes clean.
          </p>
        </section>
      )}

      <RuleSection
        title="permissions.allow"
        items={allowList}
        onRemove={(i) => void saveRule('allow', allowList.filter((_, idx) => idx !== i))}
      />
      <AddInput
        value={newAllow}
        onChange={setNewAllow}
        onAdd={() => {
          if (!newAllow.trim()) return
          void saveRule('allow', [...allowList, newAllow.trim()])
          setNewAllow('')
        }}
        placeholder="Bash(pnpm:*)"
      />

      <RuleSection
        title="permissions.deny"
        items={denyList}
        onRemove={(i) => void saveRule('deny', denyList.filter((_, idx) => idx !== i))}
      />
      <AddInput
        value={newDeny}
        onChange={setNewDeny}
        onAdd={() => {
          if (!newDeny.trim()) return
          void saveRule('deny', [...denyList, newDeny.trim()])
          setNewDeny('')
        }}
        placeholder="Write(/etc/**)"
      />

      <section>
        <h3 className="mb-1 text-[10px] uppercase tracking-wider text-muted">
          Out-of-scope path grants ({grants.length})
        </h3>
        {grants.length === 0 ? (
          <p className="text-muted">No grants. Native dialogs will prompt on first access outside the workspace.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {grants.map((g) => (
              <li
                key={g.path}
                className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg-elevated p-2"
              >
                <div className="flex-1 overflow-hidden">
                  <p className="truncate font-mono text-fg" title={g.path}>
                    {g.path}
                  </p>
                  <p className="text-[10px] text-muted">{g.kind}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void removePathGrant(g.path)}
                  className="rounded-sm border border-error/40 bg-error/10 px-2 py-0.5 text-error hover:bg-error/20"
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

interface RuleSectionProps {
  title: string
  items: string[]
  onRemove: (index: number) => void
}

function RuleSection({ title, items, onRemove }: RuleSectionProps): ReactElement {
  return (
    <section>
      <h3 className="mb-1 text-[10px] uppercase tracking-wider text-muted">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted">Empty.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {items.map((rule, i) => (
            <li
              key={`${i}-${rule}`}
              className="flex items-center justify-between gap-2 rounded-sm border border-border bg-bg-elevated px-2 py-1"
            >
              <span className="font-mono text-fg">{rule}</span>
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="text-muted hover:text-error"
                aria-label={`Remove rule ${rule}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

interface AddInputProps {
  value: string
  onChange: (v: string) => void
  onAdd: () => void
  placeholder: string
}

function AddInput({ value, onChange, onAdd, placeholder }: AddInputProps): ReactElement {
  return (
    <div className="flex items-center gap-1">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAdd()
        }}
        placeholder={placeholder}
        className="flex-1 rounded-sm border border-border bg-bg px-2 py-1 font-mono text-[11px] outline-none focus:border-accent"
      />
      <button
        type="button"
        onClick={onAdd}
        className="rounded-sm border border-border bg-bg-elevated px-2 py-1 hover:border-border-strong"
      >
        Add
      </button>
    </div>
  )
}
