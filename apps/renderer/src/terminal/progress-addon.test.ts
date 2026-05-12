// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { ProgressAddon, type IProgressState } from '@xterm/addon-progress'

/**
 * Smoke test for `@xterm/addon-progress`: drives OSC 9;4 sequences
 * through `term.write` and asserts the addon's `onChange` event fires
 * with the parsed state + value. This is the renderer-side contract
 * `useTerminalSession` depends on to update the `paneProgressStore`.
 *
 * No `term.open(...)` call — we never need a DOM screen for parser tests,
 * but jsdom is enabled for safety since xterm probes globals at import time.
 */
describe('@xterm/addon-progress — onChange dispatch', () => {
  function setup(): { term: Terminal; addon: ProgressAddon; events: IProgressState[] } {
    const term = new Terminal({ allowProposedApi: true })
    const addon = new ProgressAddon()
    term.loadAddon(addon)
    const events: IProgressState[] = []
    addon.onChange((s) => events.push({ state: s.state, value: s.value }))
    return { term, addon, events }
  }

  function writeAndFlush(term: Terminal, data: string): Promise<void> {
    return new Promise((resolve) => term.write(data, () => resolve()))
  }

  it('fires onChange with state=1 and value=42 on `ESC ] 9 ; 4 ; 1 ; 42 BEL`', async () => {
    const { term, events } = setup()
    await writeAndFlush(term, '\x1b]9;4;1;42\x07')
    expect(events.at(-1)).toEqual({ state: 1, value: 42 })
  })

  it('fires onChange with state=0 on `ESC ] 9 ; 4 ; 0 ; 0 BEL`', async () => {
    const { term, events } = setup()
    await writeAndFlush(term, '\x1b]9;4;1;73\x07')
    await writeAndFlush(term, '\x1b]9;4;0;0\x07')
    expect(events.at(-1)?.state).toBe(0)
  })

  it('fires onChange with state=2 (error) on `ESC ] 9 ; 4 ; 2 ; 0 BEL`', async () => {
    const { term, events } = setup()
    await writeAndFlush(term, '\x1b]9;4;2;0\x07')
    expect(events.at(-1)?.state).toBe(2)
  })

  it('fires onChange with state=3 (indeterminate)', async () => {
    const { term, events } = setup()
    await writeAndFlush(term, '\x1b]9;4;3;0\x07')
    expect(events.at(-1)?.state).toBe(3)
  })

  it('fires onChange with state=4 (paused)', async () => {
    const { term, events } = setup()
    await writeAndFlush(term, '\x1b]9;4;4;55\x07')
    expect(events.at(-1)).toEqual({ state: 4, value: 55 })
  })
})
