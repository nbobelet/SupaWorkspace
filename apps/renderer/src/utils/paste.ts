/**
 * Pure paste-safety utilities — no side effects, no renderer imports.
 *
 * These functions sit at the clipboard→terminal boundary and are responsible
 * for three things:
 *  1. Line-ending normalisation (CRLF/LF → CR) so xterm.js receives the
 *     control character it understands regardless of OS clipboard format.
 *  2. Multiline detection so callers can surface a confirmation dialog before
 *     sending >1 line to the shell (paste-injection mitigation).
 *  3. Size-gating so a multi-MB clipboard payload cannot freeze the renderer
 *     before we even touch the terminal.
 */

/**
 * Normalise clipboard text to the CR-only line endings that xterm.js / PTYs
 * expect when bracketedPasteMode is enabled.
 *
 * Rules (applied in one regex pass):
 *  - \r\n  → \r  (Windows CRLF, matched first to avoid double-replacement)
 *  - \n    → \r  (Unix LF)
 *
 * All other bytes — including null bytes, emoji, RTL codepoints, surrogates —
 * are preserved verbatim. The function is binary-safe.
 */
export function normalizePaste(text: string): string {
  return text.replace(/\r\n|\n/g, '\r')
}

/**
 * Return true if the normalised form of `text` contains more than one line,
 * i.e. has at least one CR after normalisation.
 *
 * Callers use this to decide whether to show a multiline-paste warning dialog.
 * The degenerate case of a string that is *only* a newline returns true.
 */
export function isMultilinePaste(text: string): boolean {
  return normalizePaste(text).includes('\r')
}

/**
 * Return false if `text` exceeds `limitBytes` characters (UTF-16 code units).
 *
 * `String.prototype.length` counts UTF-16 code units. For ASCII this equals
 * the byte count; for multi-byte codepoints it is a conservative proxy that
 * may under-count actual UTF-8 bytes, but it provides a fast O(1) check that
 * prevents the renderer from hanging on a pathological clipboard payload.
 *
 * Callers building test strings with `'x'.repeat(n)` get exactly n units,
 * so the boundary at `limitBytes` is exact for ASCII content.
 *
 * Default limit: 1 000 000 code units (~1 MB for ASCII text).
 */
export function isSafePasteSize(text: string, limitBytes = 1_000_000): boolean {
  return text.length < limitBytes
}
