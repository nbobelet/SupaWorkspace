import { type ReactElement } from 'react'
import { Bug } from 'lucide-react'
import { useBugReportStore } from '../state/bugReportStore'

// Mounted in App.tsx header next to the Settings toggle — the only persistent UI chrome.
export function BugReportButton(): ReactElement {
  const open = useBugReportStore((s) => s.open)
  return (
    <button
      type="button"
      onClick={open}
      aria-label="Report a bug"
      title="Report a bug"
      className="inline-flex items-center gap-1 rounded-sm border border-border bg-bg-elevated px-2 py-1 text-xs text-fg-subtle hover:border-border-strong hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Bug size={12} aria-hidden="true" />
      <span>Bug</span>
    </button>
  )
}
