// Detects when the PTY buffer settles on a typical shell prompt and the
// session is ready to accept the next command. Used by StateDetector to
// transition `running -> idle` after a debounce.
//
// Intentionally excludes `❯` (and any pattern already covered by
// detectUserInputRequired) — those signal `asking`, not `idle`.
export const IDLE_PROMPT_PATTERNS: RegExp[] = [
  /PS\s+[A-Za-z]:\\[^\r\n]*>\s*$/,
  /[A-Za-z][\w-]*@[\w.-]+:[^\r\n$#]*[$#]\s*$/,
  /[A-Za-z]:[\\/][^\r\n]*[>#]\s*$/,
  /\n\$\s*$/,
  /\n#\s*$/,
  /\n>\s*$/,
]

const TAIL_LENGTH = 256

export function detectIdlePrompt(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  return IDLE_PROMPT_PATTERNS.some((re) => re.test(tail))
}
