import type { ITerminalAddon } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { WebFontsAddon } from '@xterm/addon-web-fonts'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { ImageAddon } from '@xterm/addon-image'
import { ProgressAddon } from '@xterm/addon-progress'
import { ClipboardAddon } from '@xterm/addon-clipboard'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from '@xterm/addon-fit'

/**
 * Union of every concrete xterm.js addon instance the renderer builds.
 *
 * The factory returns `ITerminalAddon[]` for ergonomic iteration in the
 * mount path (`term.loadAddon(...)`), but each *element* keeps its concrete
 * class so callers can downcast with `instanceof` when they need the
 * addon's public surface (e.g. `WebglAddon.onContextLoss`).
 */
export type TerminalAddon =
  | WebglAddon
  | LigaturesAddon
  | WebFontsAddon
  | UnicodeGraphemesAddon
  | ImageAddon
  | ProgressAddon
  | ClipboardAddon
  | SearchAddon
  | SerializeAddon
  | WebLinksAddon
  | FitAddon

export interface BuildAddonsOptions {
  image?: {
    /** Max bytes per SIXEL payload — maps to `IImageAddonOptions.sixelSizeLimit`. */
    sizeLimit?: number
    /** Pixel budget — maps to `IImageAddonOptions.pixelLimit`. */
    pixelLimit?: number
    /** Enable CSI 14/16/18 t window-option reports. */
    enableSizeReports?: boolean
  }
  webFonts?: {
    /**
     * Optional list of font families to await via `WebFontsAddon.loadFonts`.
     * The factory itself does not call `loadFonts` (it is pure); the caller
     * can read this value back via the returned `WebFontsAddon` instance and
     * trigger loading once the addon is activated on a `Terminal`.
     */
    fontFamily?: string[]
  }
  clipboard?: {
    /** Reserved for future OSC 52 write-selection toggling. */
    selectionToBeCopiedOSC?: string | false
    /** Reserved for future OSC 52 read-selection toggling. */
    readData?: boolean
  }
}

/**
 * Pure factory that constructs all xterm.js addons used by the renderer in
 * the order required by `useTerminalSession`:
 *
 *  1. WebglAddon          — GPU renderer (must load first so later addons
 *                           re-layer correctly).
 *  2. LigaturesAddon      — depends on font-feature-settings; must run
 *                           before WebFonts triggers a relayout.
 *  3. WebFontsAddon       — guarantees webfont readiness before metrics.
 *  4. UnicodeGraphemesAddon — registers the v15 grapheme provider.
 *  5. ImageAddon          — SIXEL / iTerm inline image protocol.
 *  6. ProgressAddon       — OSC 9;4 progress reports.
 *  7. ClipboardAddon      — OSC 52 system clipboard bridge.
 *  8. SearchAddon         — in-pane find.
 *  9. SerializeAddon      — terminal-state -> string (for snapshots).
 * 10. WebLinksAddon       — hyperlink decoration.
 * 11. FitAddon            — last, so it sees every layer when measuring.
 *
 * Purity contract: no DOM access, no `window` access, no I/O. Each addon's
 * constructor only stores its options — DOM/document touches happen later
 * inside `addon.activate(terminal)`.
 */
export function buildAddons(opts: BuildAddonsOptions = {}): ITerminalAddon[] {
  const webgl = new WebglAddon()
  const ligatures = new LigaturesAddon()
  const webFonts = new WebFontsAddon()
  const unicodeGraphemes = new UnicodeGraphemesAddon()

  const imageOpts: {
    sixelSizeLimit?: number
    pixelLimit?: number
    enableSizeReports?: boolean
  } = {}
  if (opts.image?.sizeLimit !== undefined) imageOpts.sixelSizeLimit = opts.image.sizeLimit
  if (opts.image?.pixelLimit !== undefined) imageOpts.pixelLimit = opts.image.pixelLimit
  if (opts.image?.enableSizeReports !== undefined) {
    imageOpts.enableSizeReports = opts.image.enableSizeReports
  }
  const image = new ImageAddon(imageOpts)

  const progress = new ProgressAddon()
  const clipboard = new ClipboardAddon()
  const search = new SearchAddon()
  const serialize = new SerializeAddon()
  const webLinks = new WebLinksAddon()
  const fit = new FitAddon()

  // `webFonts.fontFamily` is intentionally consumed by callers (post-activate),
  // not here. Touch it once so TypeScript verifies the option is read.
  if (opts.webFonts?.fontFamily && opts.webFonts.fontFamily.length > 0) {
    // No-op at construction time. The caller is expected to invoke
    // `webFonts.loadFonts(opts.webFonts.fontFamily)` after activate.
  }
  if (opts.clipboard?.selectionToBeCopiedOSC !== undefined || opts.clipboard?.readData !== undefined) {
    // Reserved hooks — wired in a later wave (QW4).
  }

  return [
    webgl,
    ligatures,
    webFonts,
    unicodeGraphemes,
    image,
    progress,
    clipboard,
    search,
    serialize,
    webLinks,
    fit,
  ]
}
