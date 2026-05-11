import { describe, expect, it } from 'vitest'
import { detectUserInputRequired } from './detectUserInputRequired'

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
})
