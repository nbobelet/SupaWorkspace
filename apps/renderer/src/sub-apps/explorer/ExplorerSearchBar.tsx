import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { Loader2, Search, X } from 'lucide-react'
import type { SearchHit } from '@shared/ipc'
import { fuzzyRank } from './fuzzyMatch'

/** Cap of rendered rows. The walk returns up to 10k candidates; a human scans a
 * handful, so we only ever paint the top slice of the ranked list. */
const MAX_RESULTS = 30

/** A search needs at least this many chars: a 1-char fuzzy match against a 10k
 * candidate list is all noise, so we gate it behind a hint instead. */
const MIN_QUERY = 2

/** Debounce before fetching the candidate index. Only the FIRST query of a
 * workspace pays the IPC + walk cost; every later keystroke re-ranks the cached
 * list locally, so this is no longer the per-keystroke lag lever. */
const DEBOUNCE_MS = 150

export interface ExplorerSearchBarProps {
  workspaceId: string
  /** Reveal the picked hit in the columns + preview (wired to useExplorer.reveal). */
  onReveal: (relPath: string) => void
}

type IndexState =
  | { kind: 'empty' }
  | { kind: 'loading' }
  | { kind: 'ready'; candidates: SearchHit[] }

/**
 * Fuzzy file-search field for the Explorer header. The candidate index is
 * fetched ONCE per workspace (`window.ws.explorer.search`) and cached in a ref;
 * every keystroke re-ranks that cached list locally — no per-keystroke IPC.
 * A monotonic `searchId` tags each fetch so a superseded/cancelled walk never
 * paints over a newer one. Reaches main ONLY through `window.ws.*`.
 */
export function ExplorerSearchBar({ workspaceId, onReveal }: ExplorerSearchBarProps): ReactElement {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const listRef = useRef<HTMLUListElement>(null)

  // Candidate index for the current workspace, cached in a ref so the keystroke
  // handler can re-rank against it synchronously without an extra render.
  const indexRef = useRef<IndexState>({ kind: 'empty' })
  const searchIdRef = useRef(0)
  const inFlightRef = useRef<number | null>(null)

  const setIndex = useCallback((next: IndexState) => {
    indexRef.current = next
  }, [])

  // Invalidate the cache and cancel any in-flight walk when the workspace flips.
  useEffect(() => {
    setIndex({ kind: 'empty' })
    setQuery('')
    setResults([])
    setOpen(false)
    setSearching(false)
    return () => {
      if (inFlightRef.current !== null) {
        void window.ws.explorer.searchCancel(workspaceId, inFlightRef.current)
        inFlightRef.current = null
      }
    }
  }, [workspaceId, setIndex])

  const rankLocal = useCallback((q: string, candidates: SearchHit[]): SearchHit[] => {
    console.time('[explorer] fuzzyRank')
    const ranked = fuzzyRank(q, candidates).slice(0, MAX_RESULTS)
    console.timeEnd('[explorer] fuzzyRank')
    return ranked
  }, [])

  // One effect drives the three states off `query`. < MIN_QUERY -> hint (no IPC).
  // Index cached -> rank locally (synchronous, no IPC). Otherwise -> debounce
  // then fetch the index once, tagging it with a monotonic searchId so a stale
  // resolution can be discarded.
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < MIN_QUERY) {
      setResults([])
      setSearching(false)
      setOpen(trimmed.length > 0)
      return
    }

    const cached = indexRef.current
    if (cached.kind === 'ready') {
      setResults(rankLocal(trimmed, cached.candidates))
      setHighlight(0)
      setSearching(false)
      setOpen(true)
      return
    }

    let abandoned = false
    setSearching(true)
    setOpen(true)
    const timer = setTimeout(() => {
      const id = (searchIdRef.current += 1)
      inFlightRef.current = id
      setIndex({ kind: 'loading' })
      // The walk ignores the query (main returns the full candidate index); the
      // raw query is sent only to satisfy the IPC contract.
      window.ws.explorer
        .search(workspaceId, trimmed, id)
        .then((res) => {
          // A newer search supersedes this one: drop its result wholesale.
          if (abandoned || id !== searchIdRef.current) return
          inFlightRef.current = null
          // `cancelled` = ignore (NOT "no hits"); needs-grant = nothing to rank.
          if (res.status !== 'ok') {
            if (res.status === 'cancelled') return
            setIndex({ kind: 'empty' })
            setResults([])
            setSearching(false)
            return
          }
          setIndex({ kind: 'ready', candidates: res.hits })
          setResults(rankLocal(query.trim(), res.hits))
          setHighlight(0)
          setSearching(false)
        })
        .catch(() => {
          if (abandoned || id !== searchIdRef.current) return
          inFlightRef.current = null
          setIndex({ kind: 'empty' })
          setResults([])
          setSearching(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      abandoned = true
      clearTimeout(timer)
    }
  }, [workspaceId, query, rankLocal, setIndex])

  const pick = useCallback(
    (hit: SearchHit | undefined) => {
      if (!hit) return
      onReveal(hit.relPath)
      setOpen(false)
    },
    [onReveal],
  )

  const clear = useCallback(() => {
    setQuery('')
    setResults([])
    setOpen(false)
    setSearching(false)
  }, [])

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (open) setOpen(false)
        else clear()
        return
      }
      if (!open || results.length === 0) return
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          setHighlight((h) => Math.min(h + 1, results.length - 1))
          break
        case 'ArrowUp':
          event.preventDefault()
          setHighlight((h) => Math.max(h - 1, 0))
          break
        case 'Enter':
          event.preventDefault()
          pick(results[highlight])
          break
        default:
          break
      }
    },
    [open, results, highlight, pick, clear],
  )

  // Keep the highlighted row in view as the cursor moves through a long list.
  useEffect(() => {
    if (!open) return
    const row = listRef.current?.querySelector<HTMLElement>(`[data-result-index="${highlight}"]`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [highlight, open])

  const trimmedLen = query.trim().length
  const showHint = open && trimmedLen > 0 && trimmedLen < MIN_QUERY
  const showSearching = open && searching && results.length === 0
  const showEmpty =
    open && !searching && !showHint && trimmedLen >= MIN_QUERY && results.length === 0
  const showResults = open && results.length > 0

  return (
    <div className="relative ml-auto w-64">
      <div className="flex items-center gap-2 rounded-sm border border-border bg-bg px-2 py-1">
        {searching ? (
          <Loader2 size={13} className="shrink-0 animate-spin text-muted" aria-hidden="true" />
        ) : (
          <Search size={13} className="shrink-0 text-muted" aria-hidden="true" />
        )}
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls="explorer-search-results"
          aria-busy={searching}
          aria-label="Search files"
          placeholder="Search files…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length > 0 && setOpen(true)}
          className="min-w-0 flex-1 bg-transparent text-xs text-fg placeholder:text-muted focus:outline-none"
        />
        {query !== '' && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear search"
            className="shrink-0 rounded-sm p-0.5 text-muted hover:bg-fg/5 hover:text-fg"
          >
            <X size={12} aria-hidden="true" />
          </button>
        )}
      </div>

      {(showResults || showHint || showSearching || showEmpty) && (
        <ul
          ref={listRef}
          id="explorer-search-results"
          role="listbox"
          aria-label="Search results"
          className="supa-scroll absolute right-0 top-full z-20 mt-1 max-h-80 w-80 overflow-y-auto rounded-sm border border-border bg-bg-sunken py-1 shadow-lg"
        >
          {showHint && (
            <li role="none" className="px-3 py-1.5 text-xs text-muted">
              Type ≥2 characters
            </li>
          )}
          {showSearching && (
            <li role="none" className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted">
              <Loader2 size={12} className="animate-spin" aria-hidden="true" />
              Searching…
            </li>
          )}
          {showEmpty && (
            <li role="none" className="px-3 py-1.5 text-xs text-muted">
              No matches
            </li>
          )}
          {showResults &&
            results.map((hit, index) => {
              const selected = index === highlight
              const parent = hit.relPath
                .slice(0, hit.relPath.length - hit.name.length)
                .replace(/\/$/, '')
              return (
                <li key={hit.relPath} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    data-result-index={index}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => pick(hit)}
                    className={[
                      'flex w-full items-baseline gap-2 px-3 py-1 text-left text-xs',
                      selected ? 'bg-accent/15 text-fg' : 'text-fg-subtle hover:bg-fg/5',
                    ].join(' ')}
                  >
                    <span className="shrink-0 truncate font-medium">{hit.name}</span>
                    {parent && <span className="min-w-0 flex-1 truncate text-muted">{parent}</span>}
                  </button>
                </li>
              )
            })}
        </ul>
      )}
    </div>
  )
}
