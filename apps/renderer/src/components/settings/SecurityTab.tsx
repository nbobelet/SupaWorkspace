import { useEffect, type ReactElement } from 'react'
import { useCmdGuardStore } from '../../state/cmdGuardStore'

function fmtTs(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function SecurityTab(): ReactElement {
  const rules = useCmdGuardStore((s) => s.rules)
  const audit = useCmdGuardStore((s) => s.audit)
  const loaded = useCmdGuardStore((s) => s.loaded)
  const setRules = useCmdGuardStore((s) => s.setRules)
  const load = useCmdGuardStore((s) => s.load)

  useEffect(() => {
    void load()
  }, [load])

  if (!loaded) return <p className="text-xs text-muted">Loading…</p>

  const toggleRule = (id: string): void => {
    void setRules(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)))
  }

  return (
    <div className="supa-scroll flex h-full flex-col gap-4 overflow-y-auto">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Sensitive command rules
        </h3>
        <p className="mb-2 text-[11px] text-fg-subtle">
          When the input bar matches a regex below, a confirm dialog appears before sending to the active terminal. xterm direct typing is NOT intercepted.
        </p>
        <ul className="flex flex-col gap-1.5">
          {rules.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-2 rounded-sm border border-border bg-bg-elevated/50 px-2 py-1.5"
            >
              <input
                type="checkbox"
                checked={r.enabled}
                onChange={() => toggleRule(r.id)}
                className="mt-0.5 shrink-0"
                aria-label={`Enable rule ${r.description}`}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-xs font-medium text-fg">{r.description}</span>
                <code className="truncate font-mono text-[10px] text-muted" title={r.pattern}>
                  /{r.pattern}/
                </code>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          Audit log ({audit.length})
        </h3>
        {audit.length === 0 ? (
          <p className="text-[11px] text-muted">No entries yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {audit.slice(0, 50).map((entry) => (
              <li
                key={entry.id}
                className={[
                  'rounded-sm border px-2 py-1.5',
                  entry.decision === 'granted'
                    ? 'border-warn/40 bg-warn/5'
                    : 'border-border bg-bg-elevated/50',
                ].join(' ')}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
                  <span className="font-mono">{fmtTs(entry.ts)}</span>
                  <span
                    className={
                      entry.decision === 'granted' ? 'font-semibold text-warn' : 'font-semibold text-fg-subtle'
                    }
                  >
                    {entry.decision}
                  </span>
                </div>
                <code className="mt-0.5 block whitespace-pre-wrap break-words font-mono text-[11px] text-fg">
                  {entry.cmd}
                </code>
                <div className="mt-0.5 text-[10px] text-muted">rule: {entry.ruleId}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
