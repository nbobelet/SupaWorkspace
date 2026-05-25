import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react'
import {
  useTerminalSession,
  getTerminalSelection,
  terminalPaste,
  terminalSelectAll,
} from '../hooks/useTerminalSession'
import { useSessionStore } from '../state/sessionStore'
import { useWorkspaceStore } from '../state/workspaceStore'
import { useSearchBarStore } from '../state/searchBarStore'
import { usePaneProgressStore, type ProgressEntry } from '../state/paneProgressStore'
import { clampMenuPosition, VIEWPORT_MARGIN } from '../lib/menuPosition'
import { focusActiveSession } from '../lib/sessionFocus'
import { SearchBar } from './SearchBar'
import { showCopiedToast } from './ClipboardToast'
import { VoiceBadge } from './VoiceBadge'
import { VoiceStagingChip } from './VoiceStagingChip'

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
    case 'done':
      return 'bg-accent/30 text-accent motion-safe:animate-pulse'
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

interface CtxMenuPos {
  x: number
  y: number
}

export function TerminalPane({ sessionId, isActive, onFocus }: TerminalPaneProps): ReactElement {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const ctxMenuRef = useRef<HTMLDivElement>(null)
  const session = useSessionStore((s) => s.sessions[sessionId])
  const workspace = useWorkspaceStore((s) =>
    session ? s.workspaces.find((w) => w.id === session.workspaceId) : null,
  )
  const isSearchOpen = useSearchBarStore((s) => s.openBySession[sessionId] === true)
  const progress = usePaneProgressStore((s) => s.progressBySession[sessionId] ?? null)

  // Context menu: raw cursor position is stored; the overlay clamps itself
  // via useLayoutEffect once it measures its own rect.
  const [ctxMenu, setCtxMenu] = useState<CtxMenuPos | null>(null)
  // Tracks whether the terminal currently has a non-empty selection so the
  // Copy item can be disabled when nothing is selected.
  const [hasSelection, setHasSelection] = useState(false)
  // Clamped position applied after the menu's dimensions are measured.
  const [ctxMenuPos, setCtxMenuPos] = useState<{ left: number; top: number } | null>(null)

  // Only mount xterm once the PTY has actually been spawned. Placeholder tabs
  // restored from the snapshot stay inert until the user activates them.
  useTerminalSession(sessionId, container)

  // Focus invariant: whenever this pane is active AND its xterm element is
  // mounted in the DOM, the inner helper textarea must receive focus so the
  // user can type immediately after a tab/workspace switch — no extra click.
  // Owning the focus call here (rather than in App.tsx / activateSession)
  // guarantees it fires AFTER React commits the new tree and
  // `useTerminalSession` reattaches `handle.element`. A single rAF in the
  // caller used to fire too early and land `term.focus()` on a detached node.
  useEffect(() => {
    if (!isActive || !container) return
    focusActiveSession(sessionId)
  }, [isActive, container, sessionId])

  // Clamp context menu position once its own rect is known.
  useLayoutEffect(() => {
    if (!ctxMenu || !ctxMenuRef.current) return
    const rect = ctxMenuRef.current.getBoundingClientRect()
    setCtxMenuPos(
      clampMenuPosition({
        x: ctxMenu.x,
        y: ctxMenu.y,
        width: rect.width,
        height: rect.height,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        margin: VIEWPORT_MARGIN,
      }),
    )
  }, [ctxMenu])

  // Close context menu on Escape, outside click, or scroll.
  useEffect(() => {
    if (!ctxMenu) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setCtxMenu(null)
    }
    const onPointerDown = (e: PointerEvent): void => {
      const el = ctxMenuRef.current
      if (!el) return
      if (e.target instanceof Node && el.contains(e.target)) return
      setCtxMenu(null)
    }
    const onScroll = (): void => setCtxMenu(null)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('scroll', onScroll, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('scroll', onScroll, true)
    }
  }, [ctxMenu])

  // --- Context menu action handlers ---

  const handleContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    // Snapshot selection state at open time so Copy disabled state is accurate.
    setHasSelection(getTerminalSelection(sessionId).length > 0)
    setCtxMenuPos(null) // reset clamped pos until layout effect runs
    setCtxMenu({ x: e.clientX, y: e.clientY })
  }

  const handleCopy = (): void => {
    const text = getTerminalSelection(sessionId)
    if (!text) return
    void navigator.clipboard.writeText(text).then(() => {
      showCopiedToast()
    })
    setCtxMenu(null)
  }

  const handlePaste = (): void => {
    void navigator.clipboard.readText().then((text) => {
      terminalPaste(sessionId, text)
    })
    setCtxMenu(null)
  }

  const handleSelectAll = (): void => {
    terminalSelectAll(sessionId)
    setCtxMenu(null)
  }

  const hue = workspace?.color?.hue
  const wrapperStyle: CSSProperties | undefined =
    hue !== undefined
      ? ({
          ['--ws-hue' as string]: `${hue}deg`,
          borderLeftColor: 'oklch(70% 0.15 var(--ws-hue))',
        } as CSSProperties)
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
        <span className="font-mono text-fg-subtle">{session?.label ?? sessionId.slice(0, 8)}</span>
        <div className="flex items-center gap-1.5">
          <VoiceBadge sessionId={sessionId} />
          {progress && progress.state !== 0
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
              stateBadgeClasses(state, exitCode),
            ].join(' ')}
          >
            {stateBadgeLabel(state, exitCode)}
          </span>
        </div>
      </header>
      <div
        ref={setContainer}
        className="flex-1 overflow-hidden"
        onContextMenu={handleContextMenu}
      />
      {isSearchOpen && (
        <SearchBar
          sessionId={sessionId}
          onClose={() => useSearchBarStore.getState().close(sessionId)}
        />
      )}
      <VoiceStagingChip sessionId={sessionId} />
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          role="menu"
          aria-label="Terminal actions"
          onMouseDown={(e) => e.stopPropagation()}
          style={
            ctxMenuPos
              ? { left: ctxMenuPos.left, top: ctxMenuPos.top }
              : { left: ctxMenu.x, top: ctxMenu.y, visibility: 'hidden' }
          }
          className={[
            'fixed z-50 min-w-[160px] rounded-md border border-border bg-bg-elevated py-1 shadow-lg outline-none',
            'motion-safe:animate-in motion-safe:fade-in motion-safe:duration-100',
          ].join(' ')}
        >
          <ul className="flex flex-col">
            <li>
              <button
                type="button"
                role="menuitem"
                disabled={!hasSelection}
                onClick={handleCopy}
                className={[
                  'flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent',
                  hasSelection ? 'text-fg hover:bg-bg' : 'cursor-not-allowed text-muted',
                ].join(' ')}
                aria-label="Copy selection"
              >
                <span>Copy</span>
                <kbd className="font-mono text-[10px] text-muted">Ctrl+Shift+C</kbd>
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={handlePaste}
                className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                aria-label="Paste from clipboard"
              >
                <span>Paste</span>
                <kbd className="font-mono text-[10px] text-muted">Ctrl+Shift+V</kbd>
              </button>
            </li>
            <li>
              <button
                type="button"
                role="menuitem"
                onClick={handleSelectAll}
                className="flex w-full items-center justify-between gap-4 px-3 py-1.5 text-left text-xs text-fg hover:bg-bg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                aria-label="Select all terminal content"
              >
                <span>Select All</span>
                <kbd className="font-mono text-[10px] text-muted">Ctrl+A</kbd>
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}
