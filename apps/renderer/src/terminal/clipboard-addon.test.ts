// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { buildClipboardAddon } from './buildAddons'

/**
 * Drives OSC 52 sequences (`ESC ] 52 ; c ; <base64> BEL`) through the
 * terminal and asserts that the custom `IClipboardProvider` returned by
 * `buildClipboardAddon` correctly:
 *  - decodes + writes to `navigator.clipboard.writeText` when
 *    `allowOscWrite: true`.
 *  - silently drops the write when `allowOscWrite: false`.
 *
 * Notes:
 *  - jsdom does NOT ship `navigator.clipboard` by default — we install a
 *    stub before each test and remove it after, so test pollution is bounded.
 *  - We wait one microtask after `term.write` to allow the addon's async
 *    write to flush (`writeText` returns a Promise).
 */
type ClipboardLike = {
  writeText: (text: string) => Promise<void>
  readText: () => Promise<string>
}

function setNavigatorClipboard(cb: ClipboardLike | null): void {
  if (cb === null) {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    return
  }
  Object.defineProperty(navigator, 'clipboard', { value: cb, configurable: true })
}

function writeAndFlush(term: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => term.write(data, () => resolve()))
}

describe('buildClipboardAddon — OSC 52 policy enforcement', () => {
  let writeSpy: ReturnType<typeof vi.fn>
  let readSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    writeSpy = vi.fn().mockResolvedValue(undefined)
    readSpy = vi.fn().mockResolvedValue('')
    setNavigatorClipboard({ writeText: writeSpy, readText: readSpy })
  })

  afterEach(() => {
    setNavigatorClipboard(null)
    vi.restoreAllMocks()
  })

  it('writes to navigator.clipboard when allowOscWrite=true', async () => {
    const term = new Terminal({ allowProposedApi: true })
    const addon = buildClipboardAddon({ allowOscWrite: true, allowOscRead: false })
    term.loadAddon(addon)
    // `aGVsbG8=` is base64 for `hello`.
    await writeAndFlush(term, '\x1b]52;c;aGVsbG8=\x07')
    // The addon's provider returns a Promise that xterm awaits internally;
    // wait one microtask so the spy is visible.
    await Promise.resolve()
    await Promise.resolve()
    expect(writeSpy).toHaveBeenCalledWith('hello')
  })

  it('blocks writes to navigator.clipboard when allowOscWrite=false', async () => {
    const term = new Terminal({ allowProposedApi: true })
    const addon = buildClipboardAddon({ allowOscWrite: false, allowOscRead: false })
    term.loadAddon(addon)
    await writeAndFlush(term, '\x1b]52;c;aGVsbG8=\x07')
    await Promise.resolve()
    await Promise.resolve()
    expect(writeSpy).not.toHaveBeenCalled()
  })

  it('blocks writes after dispose-and-reload from open to closed policy', async () => {
    const term = new Terminal({ allowProposedApi: true })
    const open = buildClipboardAddon({ allowOscWrite: true, allowOscRead: false })
    term.loadAddon(open)
    await writeAndFlush(term, '\x1b]52;c;aGVsbG8=\x07')
    await Promise.resolve()
    await Promise.resolve()
    expect(writeSpy).toHaveBeenCalledTimes(1)

    // Hot-reload to a stricter policy. This mirrors the runtime path in
    // `useTerminalSession`'s settings-change effect.
    open.dispose()
    writeSpy.mockClear()
    const closed = buildClipboardAddon({ allowOscWrite: false, allowOscRead: false })
    term.loadAddon(closed)
    await writeAndFlush(term, '\x1b]52;c;aGVsbG8=\x07')
    await Promise.resolve()
    await Promise.resolve()
    expect(writeSpy).not.toHaveBeenCalled()
  })
})
