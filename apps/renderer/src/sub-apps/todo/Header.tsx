import { Plus, Settings as SettingsIcon } from 'lucide-react'
import type { ReactElement } from 'react'
import { ArchiveToggle } from './ArchiveToggle'
import { FilterBar, type FilterState } from './FilterBar'

export interface TodoHeaderProps {
  filter: FilterState
  onFilterChange: (next: FilterState) => void
  showArchive: boolean
  archivedCount: number
  onToggleArchive: () => void
  onNewTask: () => void
  onOpenSettings: () => void
  settingsOpen: boolean
}

export function TodoHeader({
  filter,
  onFilterChange,
  showArchive,
  archivedCount,
  onToggleArchive,
  onNewTask,
  onOpenSettings,
  settingsOpen,
}: TodoHeaderProps): ReactElement {
  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-border bg-bg-sunken px-3 py-2">
      <button
        type="button"
        onClick={onNewTask}
        className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent/10 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent/20"
      >
        <Plus size={12} aria-hidden="true" />
        New task
      </button>
      <span className="h-4 w-px bg-border" aria-hidden="true" />
      <FilterBar filter={filter} onChange={onFilterChange} />
      <span className="ml-auto flex items-center gap-2">
        <ArchiveToggle
          showArchive={showArchive}
          archivedCount={archivedCount}
          onToggle={onToggleArchive}
        />
        <button
          type="button"
          onClick={onOpenSettings}
          aria-pressed={settingsOpen}
          aria-label="TODO sub-app settings"
          title="TODO settings"
          className={[
            'inline-flex items-center rounded-sm border p-1.5',
            settingsOpen
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-border bg-bg-elevated text-fg-subtle hover:border-border-strong',
          ].join(' ')}
        >
          <SettingsIcon size={12} aria-hidden="true" />
        </button>
      </span>
    </div>
  )
}
