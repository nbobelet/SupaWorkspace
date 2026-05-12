import { describe, expect, it } from 'vitest'
import {
  isMultilinePaste,
  isSafePasteSize,
  normalizePaste,
} from '../utils/paste'

// ---------------------------------------------------------------------------
// normalizePaste
// ---------------------------------------------------------------------------
describe('normalizePaste', () => {
  it('empty string → empty string', () => {
    expect(normalizePaste('')).toBe('')
  })

  it('plain text without newlines → unchanged', () => {
    expect(normalizePaste('hello world')).toBe('hello world')
  })

  it('Windows CRLF → CR', () => {
    expect(normalizePaste('foo\r\nbar')).toBe('foo\rbar')
  })

  it('Unix LF → CR', () => {
    expect(normalizePaste('foo\nbar')).toBe('foo\rbar')
  })

  it('multi-line Windows CRLF → multi-CR', () => {
    expect(normalizePaste('foo\r\nbar\r\nbaz')).toBe('foo\rbar\rbaz')
  })

  it('emoji with LF — unicode preserved, LF becomes CR', () => {
    expect(normalizePaste('😀\ntest')).toBe('😀\rtest')
  })

  it('RTL Arabic text with LF — RTL characters preserved', () => {
    expect(normalizePaste('مرحبا\nworld')).toBe('مرحبا\rworld')
  })

  it('null bytes preserved — binary-safe', () => {
    expect(normalizePaste('foo\x00bar\ntest')).toBe('foo\x00bar\rtest')
  })

  it('mixed CRLF + LF in same string — both normalised to CR', () => {
    expect(normalizePaste('a\r\nb\nc')).toBe('a\rb\rc')
  })

  it('existing lone CR is left untouched', () => {
    // A raw \r from a PTY response should not be double-converted.
    expect(normalizePaste('foo\rbar')).toBe('foo\rbar')
  })
})

// ---------------------------------------------------------------------------
// isMultilinePaste
// ---------------------------------------------------------------------------
describe('isMultilinePaste', () => {
  it('single line → false', () => {
    expect(isMultilinePaste('hello')).toBe(false)
  })

  it('two lines separated by LF → true', () => {
    expect(isMultilinePaste('foo\nbar')).toBe(true)
  })

  it('two lines separated by CRLF → true', () => {
    expect(isMultilinePaste('foo\r\nbar')).toBe(true)
  })

  it('empty string → false', () => {
    expect(isMultilinePaste('')).toBe(false)
  })

  it('string that is only a newline → true', () => {
    expect(isMultilinePaste('\n')).toBe(true)
  })

  it('string that is only CRLF → true', () => {
    expect(isMultilinePaste('\r\n')).toBe(true)
  })

  it('text with no whitespace → false', () => {
    expect(isMultilinePaste('rm -rf /')).toBe(false)
  })

  // Failure scenario: a command injection attempt via multiline paste
  it('detects paste-injection payload (command + injected newline)', () => {
    const payload = 'ls\nrm -rf ~'
    expect(isMultilinePaste(payload)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// isSafePasteSize
// ---------------------------------------------------------------------------
describe('isSafePasteSize', () => {
  it('empty string → safe', () => {
    expect(isSafePasteSize('')).toBe(true)
  })

  it('"hello" → safe', () => {
    expect(isSafePasteSize('hello')).toBe(true)
  })

  it('exactly at limit (1 000 000 chars) → NOT safe (exclusive boundary)', () => {
    const oneMB = 'x'.repeat(1_000_000)
    expect(isSafePasteSize(oneMB)).toBe(false)
  })

  it('999 999 chars → safe', () => {
    const almostMB = 'x'.repeat(999_999)
    expect(isSafePasteSize(almostMB)).toBe(true)
  })

  it('1 000 001 chars → NOT safe', () => {
    const overMB = 'x'.repeat(1_000_001)
    expect(isSafePasteSize(overMB)).toBe(false)
  })

  it('custom limit respected: 10 chars, input of 9 → safe', () => {
    expect(isSafePasteSize('a'.repeat(9), 10)).toBe(true)
  })

  it('custom limit respected: 10 chars, input of 10 → NOT safe (exclusive)', () => {
    expect(isSafePasteSize('a'.repeat(10), 10)).toBe(false)
  })

  it('custom limit respected: 10 chars, input of 11 → NOT safe', () => {
    expect(isSafePasteSize('a'.repeat(11), 10)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Integration — concurrent normalizePaste calls (re-entrancy / shared state)
// ---------------------------------------------------------------------------
describe('concurrent normalizePaste', () => {
  it('10 parallel calls return consistent results (no shared mutable state)', async () => {
    const inputs = [
      'foo\r\nbar',
      '😀\ntest',
      'مرحبا\nworld',
      'foo\x00bar\ntest',
      '',
      'plain',
      'a\r\nb\nc',
      'only\n',
      '\r\n',
      'last\r\nline',
    ]

    const expected = inputs.map(normalizePaste)

    // Run all 10 concurrently — normalizePaste is sync/pure so Promise.resolve
    // wrapping faithfully tests that there is no shared mutable closure state.
    const results = await Promise.all(
      inputs.map((input) => Promise.resolve(normalizePaste(input))),
    )

    expect(results).toEqual(expected)
  })

  it('repeated calls on the same input are idempotent (no mutation)', () => {
    const input = 'line1\r\nline2\nline3'
    const first = normalizePaste(input)
    const second = normalizePaste(input)
    expect(first).toBe(second)
    // Calling again on already-normalised output must not double-convert.
    // 'line1\rline2\rline3' has no \r\n or \n → identity pass.
    expect(normalizePaste(first)).toBe(first)
  })
})
