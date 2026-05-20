import type { SearchHit } from '@shared/ipc'

/**
 * Bonus for a query char that matches immediately after the previous match —
 * contiguous runs ("expl" inside "Explorer") are the strongest signal, so this
 * dominates: a clean run must beat a string that merely hits many boundaries.
 */
const CONTIGUOUS_BONUS = 10

/**
 * Bonus for a NON-contiguous match that still lands on a word boundary (start
 * of string, after a path/word separator, or a camelCase hump). Rewards an
 * intentional jump to a new word without out-weighing a contiguous run — hence
 * it only applies when the match is not already contiguous.
 */
const BOUNDARY_BONUS = 8

/** A char at `index` that opens a new "word" — drives the boundary bonus. */
function isBoundary(target: string, index: number): boolean {
  if (index === 0) return true
  const prev = target[index - 1]
  if (prev === '/' || prev === '-' || prev === '_' || prev === '.' || prev === ' ') return true
  // camelCase hump: a capital preceded by a lower-case letter.
  const here = target[index] ?? ''
  return prev !== undefined && prev === prev.toLowerCase() && here !== here.toLowerCase()
}

/**
 * Case-insensitive subsequence score of `query` against `target`. Returns
 * `null` when not every query char can be matched in order (no match at all).
 * A higher score is a better match. Scoring favours, in order: boundary hits,
 * contiguous runs, and shorter targets (so `index.ts` beats `something-index.ts`
 * for "index"). An empty query trivially matches with a neutral score.
 */
export function fuzzyScore(query: string, target: string): number | null {
  if (query === '') return 0
  const q = query.toLowerCase()
  const t = target.toLowerCase()

  let score = 0
  let qi = 0
  let prevMatch = -2
  for (let ti = 0; ti < t.length && qi < q.length; ti += 1) {
    if (t[ti] !== q[qi]) continue
    let gain = 1
    if (ti === prevMatch + 1) gain += CONTIGUOUS_BONUS
    else if (isBoundary(target, ti)) gain += BOUNDARY_BONUS
    score += gain
    prevMatch = ti
    qi += 1
  }
  if (qi < q.length) return null

  // Shorter targets edge ahead on equal matches (small, never dominates a real
  // boundary/contiguity advantage).
  score += Math.max(0, 24 - target.length) * 0.1
  return score
}

/** Best score of a hit: its file name first, the full relPath as a fallback
 * (slightly discounted) so a path-ish query like "src/foo" still ranks. */
function hitScore(query: string, hit: SearchHit): number | null {
  const byName = fuzzyScore(query, hit.name)
  const byPath = fuzzyScore(query, hit.relPath)
  if (byName === null && byPath === null) return null
  const name = byName ?? -Infinity
  const path = byPath === null ? -Infinity : byPath * 0.9
  return Math.max(name, path)
}

/**
 * Filter `hits` to those matching `query` and sort best-first. Stable tie-break
 * on shorter name then locale order so the result list does not jitter between
 * keystrokes for equally-scored hits.
 */
export function fuzzyRank(query: string, hits: SearchHit[]): SearchHit[] {
  const scored: { hit: SearchHit; score: number }[] = []
  for (const hit of hits) {
    const score = hitScore(query, hit)
    if (score !== null) scored.push({ hit, score })
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (a.hit.name.length !== b.hit.name.length) return a.hit.name.length - b.hit.name.length
    return a.hit.relPath.localeCompare(b.hit.relPath)
  })
  return scored.map((s) => s.hit)
}
