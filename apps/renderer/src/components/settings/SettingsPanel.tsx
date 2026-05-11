import { type ReactElement } from 'react'

interface SettingsPanelProps {
  workspaceId: string
  onClose: () => void
}

export function SettingsPanel({ workspaceId: _workspaceId, onClose }: SettingsPanelProps): ReactElement {
  return (
    <aside className="flex w-96 flex-col border-l border-border bg-bg-sunken">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Settings</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-border bg-bg-elevated px-2 py-0.5 text-xs hover:border-border-strong"
        >
          Close
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-xs text-muted">
        Settings UI is implemented in step 9 (CLAUDE.md editor + MCP CRUD + permissions).
      </div>
    </aside>
  )
}
