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

/* eslint-disable no-control-regex -- ANSI escape bytes are control chars by definition */
// CSI / SGR sequences (color, cursor moves, clear, show/hide cursor, ...).
const ANSI_CSI = /\x1b\[[\d;?]*[a-zA-Z]/g
// OSC sequences (window title, hyperlinks, OSC 133 prompts, ...). End on
// BEL (\x07) or ST (\x1b\\). We accept either terminator.
const ANSI_OSC = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g
/* eslint-enable no-control-regex */

/**
 * Strip the ANSI escape sequences a typical colored prompt leaves behind
 * (cursor-show `\x1b[?25h`, color resets `\x1b[0m`, clear-EOL `\x1b[K`,
 * OSC window-title, ...). Without this step the IDLE_PROMPT_PATTERNS'
 * trailing `\s*$` anchor never matches a colored PowerShell / bash prompt
 * and the session stays stuck on "running" forever.
 */
export function stripAnsi(input: string): string {
  return input.replace(ANSI_OSC, '').replace(ANSI_CSI, '')
}

export function detectIdlePrompt(buffer: string): boolean {
  if (!buffer) return false
  const rawTail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  const tail = stripAnsi(rawTail)
  return IDLE_PROMPT_PATTERNS.some((re) => re.test(tail))
}
