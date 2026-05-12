import type { ITerminalAddon } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { LigaturesAddon } from '@xterm/addon-ligatures'
import { WebFontsAddon } from '@xterm/addon-web-fonts'
import { UnicodeGraphemesAddon } from '@xterm/addon-unicode-graphemes'
import { ImageAddon } from '@xterm/addon-image'
import { ProgressAddon } from '@xterm/addon-progress'
import {
  ClipboardAddon,
  type IClipboardProvider,
  type ClipboardSelectionType,
} from '@xterm/addon-clipboard'
import { SearchAddon } from '@xterm/addon-search'
import { SerializeAddon } from '@xterm/addon-serialize'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { FitAddon } from '@xterm/addon-fit'

/**
 * Default budget for SIXEL payloads (8 MB). Trade-off: most real-world
 * inline-image use-cases (chafa thumbnails, `imgcat <small.png>`) fit well
 * under this; larger payloads are likely a misbehaving emitter and should
 * be discarded before the decoder runs.
 */
const DEFAULT_IMAGE_SIZE_LIMIT = 8 * 1024 * 1024
/** Default pixel budget (8000 x 8000). Same rationale as `sizeLimit`. */
const DEFAULT_IMAGE_PIXEL_LIMIT = 8000 * 8000
/** Default for CSI 14/16/18 t window-size reports (xterm.js parity). */
const DEFAULT_IMAGE_ENABLE_SIZE_REPORTS = true

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
  clipboard?: ClipboardPolicy
}

/**
 * Per-session clipboard policy enforced through the `ClipboardAddon`
 * provider. Both flags default to a conservative posture:
 *  - `allowOscWrite: true` — paste-into-clipboard via OSC 52 is the only
 *    way `tmux yank` / `nvim "+y` work transparently; keep on by default.
 *  - `allowOscRead: false` — clipboard reads from a remote PTY are an
 *    exfiltration vector. Off by default.
 */
export interface ClipboardPolicy {
  allowOscWrite?: boolean
  allowOscRead?: boolean
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

  const sixelSizeLimit = opts.image?.sizeLimit ?? DEFAULT_IMAGE_SIZE_LIMIT
  const pixelLimit = opts.image?.pixelLimit ?? DEFAULT_IMAGE_PIXEL_LIMIT
  const enableSizeReports = opts.image?.enableSizeReports ?? DEFAULT_IMAGE_ENABLE_SIZE_REPORTS
  const image = new ImageAddon({ sixelSizeLimit, pixelLimit, enableSizeReports })

  const progress = new ProgressAddon()
  const clipboard = buildClipboardAddon(opts.clipboard ?? {})
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

/**
 * Narrow factory for the `ClipboardAddon` only. Used by callers that need
 * to hot-reload the clipboard policy WITHOUT remounting the terminal or
 * disposing other addons (see `useTerminalSession`'s policy-change effect).
 *
 * Policy enforcement is done through a custom `IClipboardProvider`:
 *  - `allowOscWrite=false` → `writeText` becomes a no-op (OSC 52 from the
 *    PTY is silently dropped before reaching `navigator.clipboard.writeText`).
 *  - `allowOscRead=false` → `readText` returns an empty string (PTY-side
 *    OSC 52 read request gets back an empty payload, equivalent to "no
 *    selection").
 */
export function buildClipboardAddon(policy: ClipboardPolicy): ClipboardAddon {
  const allowWrite = policy.allowOscWrite ?? true
  const allowRead = policy.allowOscRead ?? false
  const provider: IClipboardProvider = {
    async readText(_selection: ClipboardSelectionType): Promise<string> {
      if (!allowRead) return ''
      if (typeof navigator === 'undefined' || !navigator.clipboard) return ''
      try {
        return await navigator.clipboard.readText()
      } catch {
        return ''
      }
    },
    async writeText(_selection: ClipboardSelectionType, text: string): Promise<void> {
      if (!allowWrite) return
      if (typeof navigator === 'undefined' || !navigator.clipboard) return
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        // Clipboard write can fail under HTTPS-permission or focus rules.
        // Silently swallow; the PTY cannot do anything useful with the error.
      }
    },
  }
  return new ClipboardAddon(undefined, provider)
}
