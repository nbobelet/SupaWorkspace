/**
 * Push-to-talk keybind parsing + first-run conflict detection. The app has no
 * `keybindings.json`; the existing global chords live in `useKeybindings.ts`.
 * This module mirrors that set so a user-chosen voice chord that would shadow a
 * built-in shortcut can be flagged on first run (keybind_conflict_check_first_run).
 */

export interface ParsedChord {
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
  /** The non-modifier key, lower-cased (e.g. `m`, `f2`, `arrowleft`). */
  key: string
}

export function parseChord(chord: string): ParsedChord {
  const parts = chord
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
  const parsed: ParsedChord = { ctrl: false, shift: false, alt: false, meta: false, key: '' }
  for (const part of parts) {
    if (part === 'ctrl' || part === 'control') parsed.ctrl = true
    else if (part === 'shift') parsed.shift = true
    else if (part === 'alt' || part === 'option') parsed.alt = true
    else if (part === 'meta' || part === 'cmd' || part === 'command') parsed.meta = true
    else parsed.key = part
  }
  return parsed
}

/** Canonical string for equality: modifiers sorted, key last. */
export function normalizeChord(chord: string): string {
  const p = parseChord(chord)
  const mods: string[] = []
  if (p.ctrl) mods.push('ctrl')
  if (p.shift) mods.push('shift')
  if (p.alt) mods.push('alt')
  if (p.meta) mods.push('meta')
  return [...mods.sort(), p.key].join('+')
}

/**
 * Built-in chords from `useKeybindings.ts` ($mod ≈ Ctrl on win/linux). Digits
 * 1-9 (jump-to-session) are represented as the literal keys. Kept in sync
 * manually — a drifted entry only weakens the first-run warning, never breaks
 * the binding.
 */
export const RESERVED_CHORDS: readonly string[] = [
  'Ctrl+T',
  'Ctrl+W',
  'Ctrl+Shift+]',
  'Ctrl+Shift+[',
  'Ctrl+R',
  'F2',
  'Ctrl+K',
  'Ctrl+\\',
  'Ctrl+Shift+ArrowLeft',
  'Ctrl+Shift+ArrowRight',
  'Ctrl+Shift+\\',
  'Ctrl+Shift+-',
  'Ctrl+,',
  'Ctrl+F',
  'Ctrl+Shift+C',
  'Ctrl+Shift+V',
]

export function isKeybindConflict(
  chord: string,
  reserved: readonly string[] = RESERVED_CHORDS,
): boolean {
  const target = normalizeChord(chord)
  if (parseChord(chord).key === '') return true // modifier-only chord is unusable
  return reserved.some((r) => normalizeChord(r) === target)
}

/** Whether a KeyboardEvent satisfies the (held) chord. */
export function eventMatchesChord(
  event: Pick<KeyboardEvent, 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'key'>,
  chord: ParsedChord,
): boolean {
  return (
    event.ctrlKey === chord.ctrl &&
    event.shiftKey === chord.shift &&
    event.altKey === chord.alt &&
    event.metaKey === chord.meta &&
    event.key.toLowerCase() === chord.key
  )
}

/** Whether a released key ends the hold (the main key or one of the chord's modifiers). */
export function isChordReleaseKey(key: string, chord: ParsedChord): boolean {
  const k = key.toLowerCase()
  if (k === chord.key) return true
  if (chord.ctrl && (k === 'control' || k === 'ctrl')) return true
  if (chord.shift && k === 'shift') return true
  if (chord.alt && (k === 'alt' || k === 'option')) return true
  if (chord.meta && (k === 'meta' || k === 'os')) return true
  return false
}
