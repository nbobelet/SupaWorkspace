import { Bug, Sparkles } from 'lucide-react'
import type { ReactElement } from 'react'
import type { TaskKind } from '@shared/todo'

export interface KindPillProps {
  kind: TaskKind
  size?: 'sm' | 'md'
}

export function KindPill({ kind, size = 'sm' }: KindPillProps): ReactElement {
  const isTodo = kind === 'todo'
  const Icon = isTodo ? Sparkles : Bug
  const label = isTodo ? 'TODO' : 'FIX'
  const colorVar = isTodo ? 'var(--color-kind-todo)' : 'var(--color-kind-fix)'

  const sizeClasses = size === 'md' ? 'px-2 py-0.5 text-[11px]' : 'px-1.5 py-px text-[10px]'
  const iconSize = size === 'md' ? 12 : 10

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm font-semibold uppercase tracking-wide ${sizeClasses}`}
      style={{
        color: colorVar,
        backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)',
      }}
      aria-label={`Kind: ${label}`}
    >
      <Icon size={iconSize} aria-hidden="true" />
      {label}
    </span>
  )
}
