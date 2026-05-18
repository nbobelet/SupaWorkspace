import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { detectUserInputRequired, isClaudeBoxAsking } from './detectUserInputRequired'

describe('detectUserInputRequired', () => {
  describe('positive matches', () => {
    it('detects [y/N] prompt at end of buffer', () => {
      expect(detectUserInputRequired('Continue? [y/N]')).toBe(true)
      expect(detectUserInputRequired('Continue? [y/N] ')).toBe(true)
      expect(detectUserInputRequired('Continue? [Y/n]:')).toBe(true)
    })

    it('detects Press any key prompt', () => {
      expect(detectUserInputRequired('Press any key to continue...')).toBe(true)
      expect(detectUserInputRequired('PRESS ANY KEY')).toBe(true)
    })

    it('detects sudo password prompt', () => {
      expect(detectUserInputRequired('[sudo] password for nico:')).toBe(true)
      expect(detectUserInputRequired('password for root:')).toBe(true)
    })

    it('detects Claude Code permission marker', () => {
      expect(detectUserInputRequired('Do you want to allow this tool to run?')).toBe(true)
    })

    it('detects OSC 133 prompt marker', () => {
      expect(detectUserInputRequired('some output\x1b]133;A')).toBe(true)
    })
  })

  describe('negative matches', () => {
    it('returns false for empty buffer', () => {
      expect(detectUserInputRequired('')).toBe(false)
    })

    it('returns false for plain idle PTY output', () => {
      expect(detectUserInputRequired('Hello world\nfoo bar baz\n')).toBe(false)
    })

    it('returns false when prompt marker is in middle of buffer (not at end)', () => {
      expect(detectUserInputRequired('Continue? [y/N]\nUser answered yes\nmore output here')).toBe(
        false,
      )
    })

    it('returns false for trailing newline only', () => {
      expect(detectUserInputRequired('some command output\n')).toBe(false)
    })

    it('returns false for partial match (only "Press")', () => {
      expect(detectUserInputRequired('Press the button')).toBe(false)
    })

    it('returns false for help text mentioning y/N', () => {
      expect(detectUserInputRequired('Use --yes (y/n) to skip prompts. See help for more.')).toBe(
        false,
      )
    })
  })

  // Regression: Claude TUI wraps permission prompts inside a Unicode
  // box-drawing frame. The single-line `Do you want to allow ... $`
  // anchor never matches because the frame contains `│` + newlines
  // after the question. `isClaudeBoxAsking` scans a wider tail for the
  // co-occurrence of (box char) + "Do you want" + selector `❯`.
  describe('claude TUI box-asking', () => {
    const fixturePath = join(
      __dirname,
      '..',
      '..',
      'test',
      'fixtures',
      'pty',
      'claude-asking-permission.bin',
    )
    const frame = readFileSync(fixturePath, 'utf8')

    it('detects the fixture box frame as asking', () => {
      expect(isClaudeBoxAsking(frame)).toBe(true)
      expect(detectUserInputRequired(frame)).toBe(true)
    })

    it('returns false for a box frame missing "Do you want"', () => {
      const noText =
        '╭─────────╮\n│   ❯ Yes │\n│     No  │\n╰─────────╯\n'
      expect(isClaudeBoxAsking(noText)).toBe(false)
    })

    it('returns false for a box frame missing the ❯ selector', () => {
      const noSelector =
        '╭─────────────────────────╮\n│ Do you want to allow X? │\n│   Yes                    │\n│     No                   │\n╰─────────────────────────╯\n'
      expect(isClaudeBoxAsking(noSelector)).toBe(false)
    })

    it('returns false when no box-drawing char is present', () => {
      const noBox = 'Do you want to allow X?\n  ❯ Yes\n    No\n'
      expect(isClaudeBoxAsking(noBox)).toBe(false)
    })

    it('still detects asking after preceding noise pushes buffer near the tail cap', () => {
      const noise = 'x'.repeat(1500)
      expect(isClaudeBoxAsking(noise + frame)).toBe(true)
      expect(detectUserInputRequired(noise + frame)).toBe(true)
    })
  })
})
