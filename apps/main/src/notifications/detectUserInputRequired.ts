import { stripAnsi } from './detectIdlePrompt'

// OSC 133 spec: `A` = prompt-start (asking class), `B` = cmd-start, `C` =
// cmd-output, `D` = cmd-done. Only `A` is an asking signal. The `D` marker
// is the authoritative "done" — handled separately by `isOsc133Done` and
// shortcuts running→idle in stateDetector. Terminator must be `;`, BEL,
// ST, or end-of-tail — never followed by another letter.
const OSC_133_TERMINATOR = '(?:;|\\x07|\\x1b\\\\|$)'
const OSC_133_ASKING_RE = new RegExp(`\\x1b\\]133;A${OSC_133_TERMINATOR}`)
const OSC_133_CMDSTART_RE = new RegExp(`\\x1b\\]133;C${OSC_133_TERMINATOR}`)
const OSC_133_DONE_RE = new RegExp(`\\x1b\\]133;D${OSC_133_TERMINATOR}`)

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
  OSC_133_ASKING_RE,
  /❯[\s]*$/,
]

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
// Generic selector-menu marker: `│` (box wall) + up to 4 spaces + `❯` +
// at least one space + non-space content. Catches slash menus, file
// pickers and "choose an option" frames that isClaudeBoxAsking misses
// because they don't include the "Do you want" text. The leading `│` +
// limited whitespace prevents matching when `❯` is in the middle of a
// user-typed input line (Claude's input prompt uses ASCII `>` for the
// cursor, so `│ > ❯ word` never matches this anchor).
const CLAUDE_SELECTOR_LINE_RE = /│\s{0,4}❯\s+\S/

export function isClaudeBoxAsking(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > BOX_TAIL_LENGTH ? buffer.slice(-BOX_TAIL_LENGTH) : buffer
  return BOX_DRAWING_RE.test(tail) && CLAUDE_ASK_TEXT_RE.test(tail) && SELECTOR_RE.test(tail)
}

export function isClaudeSelectorMenu(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > BOX_TAIL_LENGTH ? buffer.slice(-BOX_TAIL_LENGTH) : buffer
  return CLAUDE_SELECTOR_LINE_RE.test(tail)
}

// Claude's interactive picker without box-drawing (e.g. the topic prompt
// "What do you want me to ask you about? > 1. Clarify a task / 2. ..."):
// ASCII `>` cursor at the start of one numbered line, plus at least one
// other numbered option indented with whitespace. The combination
// excludes:
//   - markdown blockquotes (every line starts with `>`, never `\s+\d+\.`)
//   - inline `> N.` substrings (anchored with `(?:^|\n)`)
//   - bare numbered lists with no cursor (no `>` at all)
//   - lone `> 1.` lines (require a second numbered option within 500 chars)
// Strips ANSI first because the highlighted line is usually colored, which
// would otherwise push the `>` cursor away from the line-start anchor.
const CLAUDE_NUMBERED_SELECTOR_RE = /(?:^|\n)>\s+\d+\.\s+\S[\s\S]{0,500}?\n[ \t]+\d+\.\s+\S/

export function isClaudeNumberedSelector(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > BOX_TAIL_LENGTH ? buffer.slice(-BOX_TAIL_LENGTH) : buffer
  return CLAUDE_NUMBERED_SELECTOR_RE.test(stripAnsi(tail))
}

export function detectUserInputRequired(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  if (USER_INPUT_PATTERNS.some((re) => re.test(tail))) return true
  return (
    isClaudeBoxAsking(buffer) || isClaudeSelectorMenu(buffer) || isClaudeNumberedSelector(buffer)
  )
}

// OSC 133;C = "command pre-exec" marker emitted by shell-integration aware
// shells right before the just-submitted command runs. Authoritative
// "command started": stateDetector transitions running and LATCHES it until
// the matching ;D (no output-lull fallback). Unlike ;A (prompt-start, kept as
// an asking-class signal for back-compat), ;C is content-agnostic — it marks
// the command lifecycle, not any output text, so a long-running foreground
// command stays running from ;C to ;D no matter how bursty its output is.
export function isOsc133CommandStart(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  return OSC_133_CMDSTART_RE.test(tail)
}

// OSC 133;D = "command done" marker emitted by shell-integration aware shells
// (zsh, fish, recent bash). Treated as authoritative: when present in the
// recent tail, stateDetector shortcuts running→idle without waiting for the
// debounce or per-type fallback timer.
export function isOsc133Done(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  return OSC_133_DONE_RE.test(tail)
}
