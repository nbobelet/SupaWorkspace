import { describe, expect, it } from 'vitest'
import {
  eventMatchesChord,
  isChordReleaseKey,
  isKeybindConflict,
  normalizeChord,
  parseChord,
} from './keybind-conflict'

describe('parseChord / normalizeChord', () => {
  it('parses modifiers + key case-insensitively', () => {
    expect(parseChord('Ctrl+Shift+M')).toEqual({
      ctrl: true,
      shift: true,
      alt: false,
      meta: false,
      key: 'm',
    })
  })

  it('normalizes modifier order', () => {
    expect(normalizeChord('Shift+Ctrl+C')).toBe(normalizeChord('Ctrl+Shift+C'))
  })
})

describe('isKeybindConflict — first-run check', () => {
  it('default Ctrl+Shift+M does NOT conflict with built-ins', () => {
    expect(isKeybindConflict('Ctrl+Shift+M')).toBe(false)
  })

  it('flags a chord that shadows a built-in (Ctrl+W)', () => {
    expect(isKeybindConflict('Ctrl+W')).toBe(true)
  })

  it('is case- and order-insensitive (shift+ctrl+c shadows Ctrl+Shift+C)', () => {
    expect(isKeybindConflict('shift+ctrl+c')).toBe(true)
  })

  it('treats a modifier-only chord as a conflict (unusable)', () => {
    expect(isKeybindConflict('Ctrl+Shift')).toBe(true)
  })
})

describe('eventMatchesChord', () => {
  const chord = parseChord('Ctrl+Shift+M')

  it('matches the exact modifier+key combination', () => {
    expect(
      eventMatchesChord(
        { ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, key: 'M' },
        chord,
      ),
    ).toBe(true)
  })

  it('does not match when a modifier is missing', () => {
    expect(
      eventMatchesChord(
        { ctrlKey: true, shiftKey: false, altKey: false, metaKey: false, key: 'm' },
        chord,
      ),
    ).toBe(false)
  })
})

describe('isChordReleaseKey', () => {
  const chord = parseChord('Ctrl+Shift+M')

  it('ends on releasing the main key', () => {
    expect(isChordReleaseKey('M', chord)).toBe(true)
  })

  it('ends on releasing a required modifier', () => {
    expect(isChordReleaseKey('Control', chord)).toBe(true)
    expect(isChordReleaseKey('Shift', chord)).toBe(true)
  })

  it('ignores an unrelated key', () => {
    expect(isChordReleaseKey('a', chord)).toBe(false)
  })
})
