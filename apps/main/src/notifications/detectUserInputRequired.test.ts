import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  detectUserInputRequired,
  isClaudeBoxAsking,
  isClaudeNumberedSelector,
  isClaudeSelectorMenu,
  isOsc133CommandStart,
  isOsc133Done,
} from './detectUserInputRequired'

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

    it('detects OSC 133 prompt-start marker (A) at end of buffer', () => {
      // The anchored regex requires the marker to be terminated by `;`, BEL,
      // ST, or end-of-tail. A bare end-of-buffer counts as terminated.
      expect(detectUserInputRequired('some output\x1b]133;A')).toBe(true)
      // With a BEL terminator (xterm convention).
      expect(detectUserInputRequired('output\x1b]133;A\x07')).toBe(true)
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
      const noText = '╭─────────╮\n│   ❯ Yes │\n│     No  │\n╰─────────╯\n'
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

  // Regression: Claude's selector menus (slash commands, file picker,
  // "choose an option") don't carry the "Do you want" text that
  // isClaudeBoxAsking requires. The reliable signal is a box-drawing
  // frame containing `❯` at the start of a content line (i.e. the
  // highlighted option). Claude's idle input prompt uses ASCII `>`,
  // not `❯`, so we must not flip the input box to asking.
  describe('claude selector menus (slash / file picker / choose option)', () => {
    it('detects a slash-command selector menu as asking', () => {
      const menu =
        '╭─────────────────╮\n│ ❯ /help          │\n│   /clear         │\n│   /exit          │\n╰─────────────────╯\n'
      expect(isClaudeSelectorMenu(menu)).toBe(true)
      expect(detectUserInputRequired(menu)).toBe(true)
    })

    it('detects a file picker selector menu as asking', () => {
      const menu =
        '╭─────────────────────╮\n│ ❯ apps/main          │\n│   apps/renderer      │\n│   packages/shared    │\n╰─────────────────────╯\n'
      expect(isClaudeSelectorMenu(menu)).toBe(true)
      expect(detectUserInputRequired(menu)).toBe(true)
    })

    it('detects a "choose an option" selector as asking', () => {
      const menu =
        '╭───────────────────╮\n│ Choose an option:  │\n│ ❯ Option A         │\n│   Option B         │\n╰───────────────────╯\n'
      expect(isClaudeSelectorMenu(menu)).toBe(true)
    })

    it('does NOT match the idle Claude input prompt (uses > not ❯)', () => {
      const idleInput =
        '╭──────────────────────╮\n│ > Type your message... │\n╰──────────────────────╯\n'
      expect(isClaudeSelectorMenu(idleInput)).toBe(false)
      expect(detectUserInputRequired(idleInput)).toBe(false)
    })

    it('does NOT match plain text containing ❯ outside a box frame', () => {
      const noBox = 'log line ❯ next step here\nmore output'
      expect(isClaudeSelectorMenu(noBox)).toBe(false)
    })

    it('does NOT match ❯ that appears inside the user typing area (│ > ❯ text)', () => {
      const userTyping =
        '╭──────────────────────╮\n│ > ❯ literal arrow     │\n╰──────────────────────╯\n'
      // ❯ is preceded by `> ` (the input cursor), not directly by │ + space,
      // so the selector matcher must NOT trip on what the user is typing.
      expect(isClaudeSelectorMenu(userTyping)).toBe(false)
    })
  })

  // Regression: Claude's interactive picker (e.g. the "What do you want
  // me to ask you about?" topic prompt) uses NO box-drawing chars and
  // ASCII `>` instead of `❯` for the cursor. None of the existing
  // matchers caught it, so a clear asking prompt fell through to
  // running -> idle (no notification, no urgent tab pill).
  describe('claude numbered selector (no box, ASCII > cursor)', () => {
    const topicPicker = [
      '[ ] Topic ',
      '',
      'What do you want me to ask you about?',
      '',
      '> 1. Clarify a task',
      '     You have a task in mind and want me to ask clarifying questions',
      '  2. Pick a skill to run',
      '     Choose from available supa-* or other skills',
      '  3. Project/file to work on',
      '     Decide which file or area of the codebase to focus on',
      '  4. Type something.',
      '',
    ].join('\n')

    it('detects the topic-picker output as asking', () => {
      expect(isClaudeNumberedSelector(topicPicker)).toBe(true)
      expect(detectUserInputRequired(topicPicker)).toBe(true)
    })

    it('detects a minimal 2-option picker as asking', () => {
      const minimal = 'Pick one\n\n> 1. Yes please\n  2. No thanks\n'
      expect(isClaudeNumberedSelector(minimal)).toBe(true)
      expect(detectUserInputRequired(minimal)).toBe(true)
    })

    it('tolerates ANSI color codes around the > cursor', () => {
      // Claude colors the highlighted line; the matcher must strip ANSI
      // before regex-testing so the `>` cursor still anchors at line start.
      const colored = 'Pick one\n\n\x1b[1;36m> 1. Yes\x1b[0m\n  2. No\n'
      expect(isClaudeNumberedSelector(colored)).toBe(true)
    })

    it('does NOT match a markdown blockquote of numbered items', () => {
      // Every blockquote line starts with `>`, never with `  ` (2-space
      // indent). The matcher requires the second numbered line to start
      // with whitespace, not `>`, so blockquotes never trip it.
      const blockquote = '> 1. First point\n> 2. Second point\n> 3. Third\n'
      expect(isClaudeNumberedSelector(blockquote)).toBe(false)
    })

    it('does NOT match a `> N.` substring that is not at line start', () => {
      const inline = 'Logger output: > 1. step done\nmore output\n'
      expect(isClaudeNumberedSelector(inline)).toBe(false)
    })

    it('does NOT match a numbered list without any > cursor', () => {
      const plainList = 'Steps:\n  1. Compile\n  2. Test\n  3. Ship\n'
      expect(isClaudeNumberedSelector(plainList)).toBe(false)
    })

    it('does NOT match a single > N. line with no second numbered option', () => {
      const lone = '> 1. lone item, no menu\n\nrandom text after\n'
      expect(isClaudeNumberedSelector(lone)).toBe(false)
    })
  })

  // Regression: OSC 133 codes had a single unanchored regex that matched
  // any of [A-D] anywhere in the buffer. This produced two bugs:
  //   1. 133;A (prompt-start) buried mid-stream falsely flipped asking.
  //   2. 133;D (cmd-done) — the authoritative done signal — was misrouted
  //      to `asking` instead of triggering immediate idle.
  // The fix anchors both regexes and exposes `isOsc133Done` separately.
  describe('OSC 133 anchored routing', () => {
    it('does NOT flip asking on 133;A buried in the middle of a buffer', () => {
      // 133;A followed by more content (not at end). Anchored regex demands
      // terminator (`;`, BEL, ST, or end-of-tail). A bare letter after `A`
      // doesn't count as a terminator — but a `;` followed by more chars
      // DOES (the spec allows OSC parameters after the type letter). We
      // accept that as a valid asking marker too — what we reject is the
      // OLD bug of matching any 133;[A-D] regardless of context.
      // This specific input has 133;A followed by `B` (a letter, not a
      // terminator), simulating a malformed/truncated escape — must NOT
      // match.
      expect(detectUserInputRequired('streaming\x1b]133;AB more text')).toBe(false)
    })

    it('isOsc133Done returns true for 133;D with BEL terminator', () => {
      expect(isOsc133Done('output\r\n\x1b]133;D\x07')).toBe(true)
    })

    it('isOsc133Done returns true for 133;D at end of buffer (no terminator byte)', () => {
      expect(isOsc133Done('output\r\n\x1b]133;D')).toBe(true)
    })

    it('isOsc133Done returns true for 133;D with semicolon+params', () => {
      // OSC 133;D;<exitcode> is the spec form. Semicolon terminates the type.
      expect(isOsc133Done('output\r\n\x1b]133;D;0\x07')).toBe(true)
    })

    it('isOsc133Done returns false for 133;A (prompt-start) or 133;B / 133;C', () => {
      expect(isOsc133Done('output\x1b]133;A\x07')).toBe(false)
      expect(isOsc133Done('output\x1b]133;B\x07')).toBe(false)
      expect(isOsc133Done('output\x1b]133;C\x07')).toBe(false)
    })

    it('isOsc133Done returns false for empty buffer', () => {
      expect(isOsc133Done('')).toBe(false)
    })

    it('isOsc133CommandStart returns true for 133;C with BEL / ST / params / end-of-tail', () => {
      expect(isOsc133CommandStart('prompt$ ls\x1b]133;C\x07')).toBe(true)
      expect(isOsc133CommandStart('cmd\x1b]133;C\x1b\\')).toBe(true)
      expect(isOsc133CommandStart('cmd\x1b]133;C;extra\x07')).toBe(true)
      expect(isOsc133CommandStart('cmd\x1b]133;C')).toBe(true)
    })

    it('isOsc133CommandStart returns false for ;A / ;B / ;D and malformed bursts', () => {
      expect(isOsc133CommandStart('output\x1b]133;A\x07')).toBe(false)
      expect(isOsc133CommandStart('output\x1b]133;B\x07')).toBe(false)
      expect(isOsc133CommandStart('output\x1b]133;D\x07')).toBe(false)
      // `C` followed by a bare letter is not a valid terminator.
      expect(isOsc133CommandStart('streaming\x1b]133;CDE more text')).toBe(false)
      expect(isOsc133CommandStart('')).toBe(false)
    })

    it('detectUserInputRequired returns false for a buffer that only contains 133;D', () => {
      // 133;D is a done signal, not an asking signal. It MUST NOT flip asking.
      expect(detectUserInputRequired('output\x1b]133;D\x07')).toBe(false)
    })
  })

  // Regression: a numbered selector that appears in scrollback (well above
  // the recent tail window) must NOT trigger asking. The buffer cap is
  // 4096 bytes in stateDetector, but isClaudeNumberedSelector reads only
  // the last 2048 — so a selector pushed past that window is invisible.
  describe('selector pushed out of tail window', () => {
    it('does NOT flip asking when a numbered selector is buried by ~3000 chars of output', () => {
      const stale = '> 1. Old option\n  2. Another option\n'
      const fresh = 'x'.repeat(3000) + '\nuser is typing now: '
      const buffer = stale + fresh
      expect(isClaudeNumberedSelector(buffer)).toBe(false)
      expect(detectUserInputRequired(buffer)).toBe(false)
    })

    it('still flips asking when the same selector sits within the tail window', () => {
      const buffer = 'recent activity\n> 1. Yes\n  2. No\n'
      expect(isClaudeNumberedSelector(buffer)).toBe(true)
      expect(detectUserInputRequired(buffer)).toBe(true)
    })
  })
})
