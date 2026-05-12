// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Terminal } from '@xterm/xterm'
import { ImageAddon } from '@xterm/addon-image'

/**
 * Smoke test for `@xterm/addon-image`: construct a real `Terminal`, load
 * the `ImageAddon` with conservative limits, and write a tiny SIXEL
 * payload. We do NOT assert on the decoded canvas (xterm's image
 * decoder uses a Web Worker + WebAssembly that jsdom cannot reliably
 * stand up — see the deferred WebAssembly error documented in
 * `e2e/terminal-smoke.spec.ts`).
 *
 * What we DO assert:
 *  - The addon constructs with the budgets that the renderer-wave
 *    defaults map (`sixelSizeLimit`, `pixelLimit`, `enableSizeReports`).
 *  - `term.loadAddon(addon)` does not throw.
 *  - Writing a sixel payload through `term.write(...)` does not throw
 *    (the parser must accept the DCS Pq ... ST sequence even if the
 *    decoder cannot finish).
 *
 * The end-to-end Sixel rendering is covered by the Electron e2e suite
 * where a real V8 isolates the WebAssembly init under a proper CSP.
 */
describe('@xterm/addon-image — construction + parser hookup', () => {
  it('constructs with budgets matching the renderer defaults', () => {
    const addon = new ImageAddon({
      sixelSizeLimit: 8 * 1024 * 1024,
      pixelLimit: 8000 * 8000,
      enableSizeReports: true,
    })
    expect(addon).toBeInstanceOf(ImageAddon)
  })

  it('loads without throwing and accepts a sixel payload via term.write', async () => {
    const term = new Terminal({ allowProposedApi: true })
    const addon = new ImageAddon({
      sixelSizeLimit: 8 * 1024 * 1024,
      pixelLimit: 8000 * 8000,
      enableSizeReports: true,
    })
    expect(() => term.loadAddon(addon)).not.toThrow()
    // Minimal SIXEL: `DCS q ... ST` — a 1-pixel placeholder. The parser
    // must accept this even though the decoder may not produce a canvas
    // under jsdom.
    //   ESC P     = DCS introducer
    //   q         = sixel mode
    //   "1;1;1;1  = raster attrs (1px wide, 1px tall)
    //   #0;2;0;0;0= color 0 = black (RGB 0/0/0 in sixel coord space)
    //   #0?       = paint a single pixel of color 0 (the `?` is the
    //              lowest sixel byte — empty row)
    //   ESC \\    = ST terminator
    const sixel = '\x1bP"1;1;1;1q#0;2;0;0;0#0?\x1b\\'
    await new Promise<void>((resolve) => term.write(sixel, () => resolve()))
    // No exception thrown → parser accepted the DCS sequence.
    expect(true).toBe(true)
  })
})
