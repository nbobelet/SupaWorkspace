import { describe, expect, it } from 'vitest'
import { generateSessionTitle } from './session-title'

describe('generateSessionTitle', () => {
  it('takes first 6 words and preserves existing capitalization', () => {
    expect(generateSessionTitle('Build me a REST API with authentication and JWT')).toBe(
      'Build me a REST API with',
    )
  })

  it('capitalizes first character of result', () => {
    expect(generateSessionTitle('refactor the auth module to use JWT tokens')).toBe(
      'Refactor the auth module to use',
    )
  })

  it('hard-truncates at maxLen without ellipsis', () => {
    const result = generateSessionTitle(
      'supercalifragilisticexpialidocious explanation requirements check',
    )
    expect(result.length).toBeLessThanOrEqual(40)
    expect(result).not.toContain('…')
    expect(result).not.toContain('...')
  })

  it('strips tokens starting with - anywhere in the prompt', () => {
    expect(generateSessionTitle('-v --json list all files')).toBe('List all files')
  })

  it('strips leading flag tokens but keeps non-flag words after them', () => {
    expect(generateSessionTitle('--model sonnet do a thing')).toBe('Sonnet do a thing')
  })

  it('returns claude for empty string', () => {
    expect(generateSessionTitle('')).toBe('claude')
  })

  it('returns claude for whitespace-only input', () => {
    expect(generateSessionTitle('   ')).toBe('claude')
  })

  it('returns claude when all tokens are flags', () => {
    expect(generateSessionTitle('--model --verbose')).toBe('claude')
  })

  it('capitalizes a single-character prompt', () => {
    expect(generateSessionTitle('a')).toBe('A')
  })

  it('respects maxWords override', () => {
    expect(generateSessionTitle('one two three four five', { maxWords: 3 })).toBe('One two three')
  })

  it('respects maxLen override', () => {
    expect(generateSessionTitle('hello world extra words', { maxLen: 10 })).toBe('Hello worl')
  })
})
