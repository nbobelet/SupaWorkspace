import { describe, expect, it } from 'vitest'
import { detectIdlePrompt, stripAnsi } from './detectIdlePrompt'

describe('stripAnsi', () => {
  it('removes CSI / SGR sequences', () => {
    expect(stripAnsi('\x1b[32mhello\x1b[0m')).toBe('hello')
    expect(stripAnsi('\x1b[?25h')).toBe('')
    expect(stripAnsi('text\x1b[Kmore')).toBe('textmore')
  })

  it('removes OSC sequences (window title, hyperlinks)', () => {
    expect(stripAnsi('\x1b]0;Window Title\x07after')).toBe('after')
    expect(stripAnsi('\x1b]8;;https://example.com\x07link\x1b]8;;\x07')).toBe('link')
  })

  it('handles ST-terminated OSC', () => {
    expect(stripAnsi('\x1b]0;title\x1b\\after')).toBe('after')
  })

  it('passes plain text through unchanged', () => {
    expect(stripAnsi('PS C:\\repo> ')).toBe('PS C:\\repo> ')
  })
})

describe('detectIdlePrompt', () => {
  it('matches plain PowerShell prompt', () => {
    expect(detectIdlePrompt('PS C:\\repo> ')).toBe(true)
  })

  it('matches plain bash prompt', () => {
    expect(detectIdlePrompt('user@host:~/dir$ ')).toBe(true)
  })

  // Regression: PowerShell with PSReadLine emits cursor-show (\x1b[?25h),
  // color-reset (\x1b[0m), and clear-EOL (\x1b[K) escapes after the visible
  // prompt characters. Without stripAnsi, the trailing `\s*$` anchor on
  // every IDLE_PROMPT_PATTERN regex fails and the session stays stuck on
  // "running" indefinitely.
  it('matches PowerShell prompt followed by trailing CSI escapes', () => {
    const buffer = '\x1b[0m\x1b]0;PowerShell\x07PS C:\\Users\\Nico> \x1b[K\x1b[?25h'
    expect(detectIdlePrompt(buffer)).toBe(true)
  })

  it('matches colored bash prompt with trailing reset', () => {
    const buffer = '\x1b[32muser@host\x1b[0m:\x1b[34m~/dir\x1b[0m$ \x1b[0m'
    expect(detectIdlePrompt(buffer)).toBe(true)
  })

  it('returns false on mid-output buffer', () => {
    expect(detectIdlePrompt('progress... 42%')).toBe(false)
  })

  it('returns false on empty buffer', () => {
    expect(detectIdlePrompt('')).toBe(false)
  })
})
