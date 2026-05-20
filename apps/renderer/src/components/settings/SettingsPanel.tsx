import { useState, type ReactElement } from 'react'
import { ClaudeMdEditor } from './ClaudeMdEditor'
import { McpServersEditor } from './McpServersEditor'
import { PermissionsManager } from './PermissionsManager'
import { SecurityTab } from './SecurityTab'

interface SettingsPanelProps {
  workspaceId: string
  onClose: () => void
}

type SettingsTab = 'claude-md' | 'mcp' | 'permissions' | 'security'

const TABS: Array<{ id: SettingsTab; label: string }> = [
  { id: 'claude-md', label: 'CLAUDE.md' },
  { id: 'mcp', label: 'MCP servers' },
  { id: 'permissions', label: 'Permissions' },
  { id: 'security', label: 'Security' },
]

export function SettingsPanel({ workspaceId, onClose }: SettingsPanelProps): ReactElement {
  const [tab, setTab] = useState<SettingsTab>('claude-md')

  return (
    <aside className="flex w-[28rem] flex-col border-l border-border bg-bg-sunken">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">
          Workspace Settings
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-sm border border-border bg-bg-elevated px-2 py-0.5 text-xs hover:border-border-strong"
        >
          Close
        </button>
      </div>

      <nav
        role="tablist"
        aria-label="Settings sections"
        className="flex border-b border-border bg-bg-sunken"
      >
        {TABS.map((t) => {
          const isActive = t.id === tab
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              type="button"
              onClick={() => setTab(t.id)}
              className={[
                'flex-1 border-b-2 px-3 py-2 text-xs',
                isActive
                  ? 'border-accent text-fg'
                  : 'border-transparent text-muted hover:text-fg-subtle',
              ].join(' ')}
            >
              {t.label}
            </button>
          )
        })}
      </nav>

      <div className="flex-1 overflow-hidden p-3">
        {tab === 'claude-md' && <ClaudeMdEditor workspaceId={workspaceId} />}
        {tab === 'mcp' && <McpServersEditor workspaceId={workspaceId} />}
        {tab === 'permissions' && <PermissionsManager workspaceId={workspaceId} />}
        {tab === 'security' && <SecurityTab />}
      </div>
    </aside>
  )
}
