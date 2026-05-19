import { Archive } from 'lucide-react'
import type { ReactElement } from 'react'

export interface ArchiveToggleProps {
  showArchive: boolean
  archivedCount: number
  onToggle: () => void
}

export function ArchiveToggle({ showArchive, archivedCount, onToggle }: ArchiveToggleProps): ReactElement {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={showArchive}
      className={[
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium transition-colors',
        showArchive
          ? 'border-accent bg-accent/10 text-accent'
          : 'border-border bg-bg-elevated text-fg-subtle hover:border-border-strong',
      ].join(' ')}
    >
      <Archive size={12} aria-hidden="true" />
      <span>{showArchive ? 'Hide archive' : 'Show archive'}</span>
      <span
        aria-label={`${archivedCount} archived`}
        className="inline-flex min-w-[1.25rem] justify-center rounded-full bg-bg-sunken px-1 py-0.5 text-[10px] text-fg-subtle"
      >
        {archivedCount}
      </span>
    </button>
  )
}
