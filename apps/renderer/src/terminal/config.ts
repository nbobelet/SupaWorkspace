/**
 * Default regex sets used by the per-session `MarkerRegistry`:
 *
 *  - `DEFAULT_ERROR_PATTERNS` — matched line-by-line against newly-completed
 *    terminal lines; a hit triggers an `error` marker on the overview ruler.
 *  - `DEFAULT_PROMPT_PATTERNS` — matched against the most recent line when the
 *    cursor returns to column 0; a hit signals a command-end "boundary".
 *
 * Both are intentionally conservative: false positives on the boundary side
 * just produce muted ruler ticks that the user can ignore. The error
 * patterns cover the canonical cases (`error:` / `Error:` / `exit status N`
 * / `bash: cmd: command not found` / standard compiler `file:line:col:
 * error` triple). Pattern lists are `as const` so callers can read them as
 * `ReadonlyArray<RegExp>`.
 */
export const DEFAULT_ERROR_PATTERNS: ReadonlyArray<RegExp> = [
  /^(error|err|fatal|failed):/i,
  /\bError:\s/,
  /exit status [1-9]\d*/,
  /^bash: .+: command not found$/,
  /^[^:]+:\d+:\d+:\s+error/i,
]

export const DEFAULT_PROMPT_PATTERNS: ReadonlyArray<RegExp> = [
  /[$#>❯]\s$/,
]
