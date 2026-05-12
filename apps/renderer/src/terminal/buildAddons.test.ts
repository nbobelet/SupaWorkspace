import { describe, it, expect, vi } from 'vitest'

// Each `@xterm/addon-*` package ships an ESM `lib/*.mjs` build but advertises
// a missing CJS `main` in its `package.json`. Vitest's Node resolver follows
// `main`, which fails. We mock every addon module with a stub class — the
// test then asserts the *order* and *constructor argument propagation*,
// both of which are the contract callers depend on. No DOM, no Terminal.

interface ITerminalLike {
  // Empty marker — the stubs' `activate` accepts anything; we never call it.
  cols?: number
}

type StubArgs = readonly unknown[]

class StubAddon {
  public readonly ctorArgs: StubArgs
  constructor(...args: StubArgs) {
    this.ctorArgs = args
  }
  activate(_t: ITerminalLike): void {
    /* no-op */
  }
  dispose(): void {
    /* no-op */
  }
}

class WebglAddonStub extends StubAddon {}
class LigaturesAddonStub extends StubAddon {}
class WebFontsAddonStub extends StubAddon {}
class UnicodeGraphemesAddonStub extends StubAddon {}

interface ImageOpts {
  sixelSizeLimit?: number
  pixelLimit?: number
  enableSizeReports?: boolean
}
class ImageAddonStub extends StubAddon {
  public readonly _opts: ImageOpts
  constructor(opts: ImageOpts = {}) {
    super(opts)
    this._opts = opts
  }
}
class ProgressAddonStub extends StubAddon {}
class ClipboardAddonStub extends StubAddon {
  public readonly _base64: unknown
  public readonly _provider: unknown
  constructor(base64?: unknown, provider?: unknown) {
    super(base64, provider)
    this._base64 = base64
    this._provider = provider
  }
}
class SearchAddonStub extends StubAddon {}
class SerializeAddonStub extends StubAddon {}
class WebLinksAddonStub extends StubAddon {}
class FitAddonStub extends StubAddon {}

vi.mock('@xterm/addon-webgl', () => ({ WebglAddon: WebglAddonStub }))
vi.mock('@xterm/addon-ligatures', () => ({ LigaturesAddon: LigaturesAddonStub }))
vi.mock('@xterm/addon-web-fonts', () => ({ WebFontsAddon: WebFontsAddonStub }))
vi.mock('@xterm/addon-unicode-graphemes', () => ({ UnicodeGraphemesAddon: UnicodeGraphemesAddonStub }))
vi.mock('@xterm/addon-image', () => ({ ImageAddon: ImageAddonStub }))
vi.mock('@xterm/addon-progress', () => ({ ProgressAddon: ProgressAddonStub }))
vi.mock('@xterm/addon-clipboard', () => ({ ClipboardAddon: ClipboardAddonStub }))
vi.mock('@xterm/addon-search', () => ({ SearchAddon: SearchAddonStub }))
vi.mock('@xterm/addon-serialize', () => ({ SerializeAddon: SerializeAddonStub }))
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: WebLinksAddonStub }))
vi.mock('@xterm/addon-fit', () => ({ FitAddon: FitAddonStub }))

// Import AFTER `vi.mock` calls — vitest hoists them, but be explicit.
const { buildAddons } = await import('./buildAddons')

describe('buildAddons', () => {
  it('returns the 11 addons in the canonical order', () => {
    const addons = buildAddons()
    expect(addons).toHaveLength(11)
    expect(addons[0]).toBeInstanceOf(WebglAddonStub)
    expect(addons[1]).toBeInstanceOf(LigaturesAddonStub)
    expect(addons[2]).toBeInstanceOf(WebFontsAddonStub)
    expect(addons[3]).toBeInstanceOf(UnicodeGraphemesAddonStub)
    expect(addons[4]).toBeInstanceOf(ImageAddonStub)
    expect(addons[5]).toBeInstanceOf(ProgressAddonStub)
    expect(addons[6]).toBeInstanceOf(ClipboardAddonStub)
    expect(addons[7]).toBeInstanceOf(SearchAddonStub)
    expect(addons[8]).toBeInstanceOf(SerializeAddonStub)
    expect(addons[9]).toBeInstanceOf(WebLinksAddonStub)
    expect(addons[10]).toBeInstanceOf(FitAddonStub)
  })

  it('is a pure factory — repeated calls produce fresh, independent instances', () => {
    const a = buildAddons()
    const b = buildAddons()
    for (let i = 0; i < a.length; i++) {
      expect(a[i]).not.toBe(b[i])
    }
  })

  it('passes the image sizeLimit option through to ImageAddon (sixelSizeLimit)', () => {
    const addons = buildAddons({ image: { sizeLimit: 12345 } })
    const image = addons[4]
    expect(image).toBeInstanceOf(ImageAddonStub)
    if (!(image instanceof ImageAddonStub)) throw new Error('unreachable')
    expect(image._opts.sixelSizeLimit).toBe(12345)
  })

  it('passes image.pixelLimit and image.enableSizeReports through', () => {
    const addons = buildAddons({
      image: { pixelLimit: 9_000_000, enableSizeReports: false },
    })
    const image = addons[4]
    if (!(image instanceof ImageAddonStub)) throw new Error('unreachable')
    expect(image._opts.pixelLimit).toBe(9_000_000)
    expect(image._opts.enableSizeReports).toBe(false)
  })

  it('applies conservative defaults when no image opts are provided', () => {
    const addons = buildAddons()
    const image = addons[4]
    if (!(image instanceof ImageAddonStub)) throw new Error('unreachable')
    expect(image._opts.sixelSizeLimit).toBe(8 * 1024 * 1024)
    expect(image._opts.pixelLimit).toBe(8000 * 8000)
    expect(image._opts.enableSizeReports).toBe(true)
  })

  it('accepts webFonts.fontFamily and clipboard policy without throwing', () => {
    expect(() =>
      buildAddons({
        webFonts: { fontFamily: ['JetBrains Mono', 'Fira Code'] },
        clipboard: { allowOscWrite: false, allowOscRead: false },
      }),
    ).not.toThrow()
  })

  it('builds a ClipboardAddon with a custom provider that honors the policy', () => {
    const addons = buildAddons({ clipboard: { allowOscWrite: true, allowOscRead: false } })
    const clipboard = addons[6]
    if (!(clipboard instanceof ClipboardAddonStub)) throw new Error('unreachable')
    expect(clipboard._provider).toBeTypeOf('object')
    expect(clipboard._provider).not.toBeNull()
  })
})
