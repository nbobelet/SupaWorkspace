/* eslint-disable no-control-regex -- ESC byte required for OSC 133 prompt detection */
export const USER_INPUT_PATTERNS: RegExp[] = [
  /\[y\/N\][\s:]*$/i,
  /\[Y\/n\][\s:]*$/i,
  /\[yes\/no\][\s:]*$/i,
  /\(y\/n\)[\s:]*$/i,
  /\(yes\/no\)[\s:]*$/i,
  /Press\s+any\s+key[^\n]*$/i,
  /Press\s+(?:Enter|\[Enter\])\s+to[^\n]*$/i,
  /Do\s+you\s+want\s+to\s+allow[^\n]*$/i,
  /^\[sudo\][^\n]*password[^\n]*:[\s]*$/im,
  /^password\s+for\s+\S+:[\s]*$/im,
  /\x1b\]133;[A-D]/,
  /❯[\s]*$/,
]
/* eslint-enable no-control-regex */

const TAIL_LENGTH = 256
// Claude TUI box frames wrap permission prompts across many lines so the
// `Do you want to allow ... $` single-line anchor in USER_INPUT_PATTERNS
// never matches. The box matcher scans a wider tail for the combo
// (box-drawing char) + "Do you want" + selector marker `❯` — that triple
// only co-occurs inside a Claude permission frame.
const BOX_TAIL_LENGTH = 2048
const BOX_DRAWING_RE = /[╭╮╰╯│─]/
const CLAUDE_ASK_TEXT_RE = /do\s+you\s+want/i
const SELECTOR_RE = /❯/

export function isClaudeBoxAsking(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > BOX_TAIL_LENGTH ? buffer.slice(-BOX_TAIL_LENGTH) : buffer
  return BOX_DRAWING_RE.test(tail) && CLAUDE_ASK_TEXT_RE.test(tail) && SELECTOR_RE.test(tail)
}

export function detectUserInputRequired(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  if (USER_INPUT_PATTERNS.some((re) => re.test(tail))) return true
  return isClaudeBoxAsking(buffer)
}
