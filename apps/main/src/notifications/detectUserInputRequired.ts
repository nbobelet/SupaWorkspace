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

export function detectUserInputRequired(buffer: string): boolean {
  if (!buffer) return false
  const tail = buffer.length > TAIL_LENGTH ? buffer.slice(-TAIL_LENGTH) : buffer
  return USER_INPUT_PATTERNS.some((re) => re.test(tail))
}
