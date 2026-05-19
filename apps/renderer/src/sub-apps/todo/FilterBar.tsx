import { Filter } from 'lucide-react'
import type { ReactElement } from 'react'
import type { TaskKind, TaskSeverity } from '@shared/todo'
import { KindPill } from './KindPill'

export type SortKey = 'manual' | 'deadline' | 'severity' | 'dateStarted'

export interface FilterState {
  kinds: Set<TaskKind>
  severities: Set<TaskSeverity>
  sort: SortKey
}

export const DEFAULT_FILTER: FilterState = {
  kinds: new Set<TaskKind>(['todo', 'fix']),
  severities: new Set<TaskSeverity>(['low', 'medium', 'high']),
  sort: 'manual',
}

export interface FilterBarProps {
  filter: FilterState
  onChange: (next: FilterState) => void
}

const SEVERITY_COLOR: Record<TaskSeverity, string> = {
  low: 'var(--color-severity-low)',
  medium: 'var(--color-severity-medium)',
  high: 'var(--color-severity-high)',
}

const SEVERITY_LABEL: Record<TaskSeverity, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
}

const SORT_LABEL: Record<SortKey, string> = {
  manual: 'Manual',
  deadline: 'Deadline',
  severity: 'Severity',
  dateStarted: 'Date started',
}

export function FilterBar({ filter, onChange }: FilterBarProps): ReactElement {
  const toggleKind = (k: TaskKind): void => {
    const kinds = new Set(filter.kinds)
    if (kinds.has(k)) kinds.delete(k)
    else kinds.add(k)
    if (kinds.size === 0) kinds.add(k)
    onChange({ ...filter, kinds })
  }

  const toggleSeverity = (s: TaskSeverity): void => {
    const severities = new Set(filter.severities)
    if (severities.has(s)) severities.delete(s)
    else severities.add(s)
    onChange({ ...filter, severities })
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-muted">
        <Filter size={11} aria-hidden="true" />
        Filter
      </span>
      <div className="flex items-center gap-1" role="group" aria-label="Filter by kind">
        {(['todo', 'fix'] as const).map((kind) => {
          const active = filter.kinds.has(kind)
          return (
            <button
              key={kind}
              type="button"
              onClick={() => toggleKind(kind)}
              aria-pressed={active}
              className={[
                'rounded-sm border px-1 py-0.5 transition-opacity',
                active ? 'border-border-strong opacity-100' : 'border-border opacity-50',
              ].join(' ')}
            >
              <KindPill kind={kind} />
            </button>
          )
        })}
      </div>
      <div className="flex items-center gap-1" role="group" aria-label="Filter by severity">
        {(['low', 'medium', 'high'] as const).map((sev) => {
          const active = filter.severities.has(sev)
          return (
            <button
              key={sev}
              type="button"
              onClick={() => toggleSeverity(sev)}
              aria-pressed={active}
              className={[
                'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px]',
                active ? 'border-border-strong text-fg' : 'border-border text-muted',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: SEVERITY_COLOR[sev] }}
              />
              {SEVERITY_LABEL[sev]}
            </button>
          )
        })}
      </div>
      <label className="inline-flex items-center gap-1 text-[11px] text-fg-subtle">
        <span className="uppercase tracking-wider text-muted">Sort</span>
        <select
          value={filter.sort}
          onChange={(e) => onChange({ ...filter, sort: e.target.value as SortKey })}
          className="rounded-sm border border-border bg-bg-elevated px-1 py-0.5 text-xs"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
            <option key={key} value={key}>
              {SORT_LABEL[key]}
            </option>
          ))}
        </select>
      </label>
    </div>
  )
}
