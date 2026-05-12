import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { focusTerminal, getMarkerRegistry, getSearchAddon } from '../hooks/useTerminalSession'
import { useDesignTokens } from '../hooks/useDesignTokens'

interface SearchBarProps {
  sessionId: string
  onClose: () => void
}

interface ResultState {
  index: number
  total: number
}

/**
 * Floating in-pane search bar — pinned top-right of the focused terminal
 * pane. Driven entirely by xterm's `SearchAddon`:
 *
 *  - `findNext(query, { decorations })` paints all hits onto the overview
 *    ruler + an alpha-composed match background in the viewport.
 *  - `onDidChangeResults` feeds the `current / total` hit counter.
 *
 * Only one SearchBar may be mounted at a time across the window — the
 * `searchBarStore` enforces the invariant; this component renders only
 * when its own session-id entry is true.
 */
export function SearchBar({ sessionId, onClose }: SearchBarProps): ReactElement {
  const tokens = useDesignTokens()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [result, setResult] = useState<ResultState>({ index: -1, total: 0 })

  // Subscribe to the addon's `onDidChangeResults` event for the hit-count
  // display. The addon may not be available if it failed to load — guard
  // every access. Re-subscribe whenever the session changes.
  useEffect(() => {
    const addon = getSearchAddon(sessionId)
    if (!addon) return
    const sub = addon.onDidChangeResults((event) => {
      setResult({ index: event.resultIndex, total: event.resultCount })
    })
    return () => sub.dispose()
  }, [sessionId])

  // Re-derive the decorations option block from the current token snapshot
  // every render — cheap, and keeps colors live when the user flips theme.
  const decorations = (() => {
    const registry = getMarkerRegistry(sessionId)
    if (registry) return registry.searchDecorationOptions()
    // Fallback when the registry is missing (test seam) — derive directly
    // from tokens so the SearchBar still functions.
    return {
      matchOverviewRuler: tokens.accent,
      activeMatchColorOverviewRuler: tokens.warn,
      matchBackground: tokens.accent,
      activeMatchBackground: tokens.warn,
    }
  })()

  const findNext = useCallback(
    (q: string): void => {
      const addon = getSearchAddon(sessionId)
      if (!addon || q.length === 0) return
      addon.findNext(q, { decorations })
    },
    [sessionId, decorations],
  )

  const findPrev = useCallback(
    (q: string): void => {
      const addon = getSearchAddon(sessionId)
      if (!addon || q.length === 0) return
      addon.findPrevious(q, { decorations })
    },
    [sessionId, decorations],
  )

  // When the query changes, fire `findNext` immediately so the user sees
  // hit highlights as they type. Empty input clears any active hit.
  useEffect(() => {
    if (query.length === 0) {
      const addon = getSearchAddon(sessionId)
      addon?.clearDecorations()
      setResult({ index: -1, total: 0 })
      return
    }
    findNext(query)
  }, [query, findNext, sessionId])

  // Autofocus the input on mount. `autoFocus` attribute alone is unreliable
  // in some test contexts; this guarantees the cursor lands here.
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>): void => {
      if (event.key === 'Enter') {
        event.preventDefault()
        if (event.shiftKey) findPrev(query)
        else findNext(query)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        const addon = getSearchAddon(sessionId)
        addon?.clearDecorations()
        onClose()
        // Refocus the inner xterm helper textarea so typing immediately
        // resumes in the terminal.
        focusTerminal(sessionId)
      }
    },
    [query, findNext, findPrev, onClose, sessionId],
  )

  const total = result.total
  const current = total > 0 ? result.index + 1 : 0

  return (
    <div
      role="search"
      aria-label="Search terminal"
      data-testid="terminal-search-bar"
      className="pointer-events-auto absolute right-2 top-10 z-20 flex items-center gap-1 rounded-md border border-border bg-bg-elevated px-2 py-1 text-xs text-fg shadow-md motion-safe:transition-opacity"
    >
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        aria-label="Search query"
        placeholder="Find in terminal"
        className="w-44 rounded-sm border border-border bg-bg px-2 py-0.5 font-mono text-xs text-fg placeholder:text-muted focus-visible:border-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      />
      <span
        aria-live="polite"
        aria-label={total > 0 ? `${current} of ${total} matches` : 'No matches'}
        className="min-w-[3.5rem] text-center font-mono text-[10px] text-muted"
      >
        {current} / {total}
      </span>
      <button
        type="button"
        onClick={() => findPrev(query)}
        aria-label="Previous match"
        title="Previous match (Shift+Enter)"
        className="rounded-sm p-0.5 text-fg-subtle hover:bg-bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <ChevronLeft size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => findNext(query)}
        aria-label="Next match"
        title="Next match (Enter)"
        className="rounded-sm p-0.5 text-fg-subtle hover:bg-bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <ChevronRight size={14} aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => {
          const addon = getSearchAddon(sessionId)
          addon?.clearDecorations()
          onClose()
          focusTerminal(sessionId)
        }}
        aria-label="Close search"
        title="Close (Esc)"
        className="rounded-sm p-0.5 text-fg-subtle hover:bg-bg-sunken hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  )
}
