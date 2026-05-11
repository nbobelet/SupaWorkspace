import { type ReactElement } from 'react'
import { useLayoutStore, type LayoutMode } from '../state/layoutStore'

const LABELS: Record<LayoutMode, string> = {
  single: 'Single',
  grid: 'Grid',
  'split-horizontal': 'Split H',
  'split-vertical': 'Split V',
  cascade: 'Cascade',
}

const ICONS: Record<LayoutMode, string> = {
  single: '▢',
  grid: '⊞',
  'split-horizontal': '⊟',
  'split-vertical': '⊟',
  cascade: '☰',
}

export function LayoutSwitcher(): ReactElement {
  const mode = useLayoutStore((s) => s.mode)
  const setMode = useLayoutStore((s) => s.setMode)
  const modes = useLayoutStore((s) => s.availableModes())

  return (
    <div role="toolbar" aria-label="Layout switcher" className="flex items-center gap-1">
      {modes.map((m) => {
        const active = m === mode
        return (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={active}
            aria-label={`Switch to ${LABELS[m]} layout`}
            title={LABELS[m]}
            className={[
              'rounded-sm border px-2 py-1 text-xs',
              active
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-border bg-bg-elevated text-fg-subtle hover:border-border-strong',
            ].join(' ')}
          >
            <span aria-hidden="true" className={m === 'split-vertical' ? 'inline-block rotate-90' : ''}>
              {ICONS[m]}
            </span>
            <span className="ml-1">{LABELS[m]}</span>
          </button>
        )
      })}
    </div>
  )
}
