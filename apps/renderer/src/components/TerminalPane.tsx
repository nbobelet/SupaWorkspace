import { useRef, useState, type CSSProperties, type ReactElement } from 'react'
import { useTerminalSession } from '../hooks/useTerminalSession'
import { useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useSearchBarStore } from '../state/searchBarStore'
import { usePaneProgressStore, type ProgressEntry } from '../state/paneProgressStore'
import { activateSession } from '../lib/sessionFocus'
import { SearchBar } from './SearchBar'

interface TerminalPaneProps {
  sessionId: string
  isActive: boolean
  onFocus: () => void
}

function stateBadgeClasses(state: string, exitCode: number | null): string {
  switch (state) {
    case 'running':
      return 'bg-running/20 text-running'
    case 'asking':
      return 'bg-warn/20 text-warn motion-safe:animate-pulse'
    case 'ending':
      return exitCode !== null && exitCode !== 0
        ? 'bg-error/20 text-error'
        : 'bg-accent-dim/40 text-accent'
    case 'idle':
    default:
      return 'bg-border/40 text-muted'
  }
}

function stateBadgeLabel(state: string, exitCode: number | null): string {
  if (state === 'ending') {
    return exitCode !== null && exitCode !== 0 ? `ended ${exitCode}` : 'ended'
  }
  return state
}

/**
 * Map of the 5 ProgressAddon states to (label, glyph, token-class).
 *  - state 0 (no progress) is filtered out before this function runs.
 *  - state 1 (normal) shows the live percentage.
 *  - state 2 (error) → red token.
 *  - state 3 (indeterminate) → "…" — value is ignored per the addon spec.
 *  - state 4 (paused) → warn token.
 */
function progressPill(entry: ProgressEntry): {
  glyph: string
  classes: string
  ariaLabel: string
} {
  const pct = Math.max(0, Math.min(100, Math.round(entry.value)))
  switch (entry.state) {
    case 1:
      return {
        glyph: `${pct}%`,
        classes: 'bg-running/30 text-running',
        ariaLabel: `terminal progress: set ${pct}%`,
      }
    case 2:
      return {
        glyph: '!',
        classes: 'bg-error/30 text-error',
        ariaLabel: `terminal progress: error ${pct}%`,
      }
    case 3:
      return {
        glyph: '…',
        classes: 'bg-running/30 text-running',
        ariaLabel: 'terminal progress: indeterminate',
      }
    case 4:
      return {
        glyph: '‖',
        classes: 'bg-warn/30 text-warn',
        ariaLabel: `terminal progress: paused ${pct}%`,
      }
    default:
      return {
        glyph: '',
        classes: '',
        ariaLabel: 'terminal progress: idle',
      }
  }
}

export function TerminalPane({ sessionId, isActive, onFocus }: TerminalPaneProps): ReactElement {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const session = useSessionStore((s) => s.sessions[sessionId])
  const workspace = useWorkspaceStore((s) =>
    session ? s.workspaces.find((w) => w.id === session.workspaceId) : null,
  )
  const isPending = session?.pendingSpawn === true
  const isSearchOpen = useSearchBarStore((s) => s.openBySession[sessionId] === true)
  const progress = usePaneProgressStore((s) => s.progressBySession[sessionId] ?? null)

  // Only mount xterm once the PTY has actually been spawned. Placeholder tabs
  // restored from the snapshot stay inert until the user activates them.
  useTerminalSession(sessionId, isPending ? null : container)

  const hue = workspace?.color?.hue
  const wrapperStyle: CSSProperties | undefined =
    hue !== undefined
      ? ({ ['--ws-hue' as string]: `${hue}deg`, borderLeftColor: 'oklch(70% 0.15 var(--ws-hue))' } as CSSProperties)
      : undefined

  const state = session?.state ?? 'idle'
  const exitCode = session?.exitCode ?? null

  return (
    <div
      ref={wrapperRef}
      onMouseDown={onFocus}
      style={wrapperStyle}
      data-session-id={sessionId}
      data-state={state}
      className={[
        'relative flex h-full w-full flex-col overflow-hidden rounded-md border bg-bg-elevated',
        hue !== undefined ? 'border-l-4' : '',
        isActive ? 'border-accent ring-1 ring-accent/40' : 'border-border',
        // xterm-always-focused invariant: when the inner xterm has DOM focus,
        // surface a stronger ring so keyboard users see which pane receives
        // their keystrokes.
        'focus-within:ring-2 focus-within:ring-accent focus-within:ring-offset-0',
      ].join(' ')}
    >
      <header className="flex items-center justify-between border-b border-border bg-bg-sunken px-3 py-1.5 text-xs">
        <span className="font-mono text-fg-subtle">
          {session?.label ?? sessionId.slice(0, 8)}
        </span>
        <div className="flex items-center gap-1.5">
          {!isPending && progress && progress.state !== 0
            ? (() => {
                const pill = progressPill(progress)
                return (
                  <span
                    aria-label={pill.ariaLabel}
                    data-progress-state={progress.state}
                    className={[
                      'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider',
                      pill.classes,
                    ].join(' ')}
                  >
                    {pill.glyph}
                  </span>
                )
              })()
            : null}
          <span
            aria-live="polite"
            className={[
              'rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider',
              isPending ? 'bg-border/40 text-muted' : stateBadgeClasses(state, exitCode),
            ].join(' ')}
          >
            {isPending ? 'paused' : stateBadgeLabel(state, exitCode)}
          </span>
        </div>
      </header>
      {isPending ? (
        <button
          type="button"
          onClick={() => void activateSession(sessionId)}
          className="flex flex-1 flex-col items-center justify-center gap-2 text-muted hover:text-fg"
        >
          <span className="font-mono text-xs uppercase tracking-wider">Click to start</span>
          <span className="text-[10px]">
            Restored from previous session. PTY spawns on activation.
          </span>
        </button>
      ) : (
        <div ref={setContainer} className="flex-1 overflow-hidden" />
      )}
      {isSearchOpen && !isPending && (
        <SearchBar
          sessionId={sessionId}
          onClose={() => useSearchBarStore.getState().close(sessionId)}
        />
      )}
    </div>
  )
}
