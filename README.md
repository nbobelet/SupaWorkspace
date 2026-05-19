# SupaWorkspace

Multi-session terminal workspace manager for the `claude` CLI and shell sessions. Built with Electron, React 19, xterm.js, and node-pty.

A workspace is a folder on disk. Sessions spawned inside a workspace inherit its scope (cwd + permissions). Switch between single / grid / split layouts without losing live terminal state.

The canonical vocabulary — `Workspace`, `Session`, `Type` — is pinned in [docs/concepts.md](docs/concepts.md).

## Features

- **Per-workspace tab scoping** — terminal tabs are filtered by the active workspace; no cross-workspace bleed.
- **Workspace color + settings menu** — each workspace gets an auto-assigned OKLCH hue (curated 8-color palette, picker maximizes hue distance). Settings icon on tile hover opens a popover: Rename / Change color / Delete. Active terminal pane gets a left border matching the workspace color.
- **Workspace delete cascade** — deleting a workspace kills its sessions, revokes its PathGrants, and clears its notifications.
- **Markdown notes panel** — a 4th tab in Settings with a CodeMirror markdown editor. **Notes persist across workspace switches** (stored globally in `electron-store`).
- **Inline tab rename** — double-click a tab label to rename. Same UX for workspace tiles; shared `useInlineRename` hook.
- **Notification center** — bell badge on each workspace tile, click for a popover of recent notifications. Sonner toasts top-right for live transitions. Notifications for a workspace are cleared when you click into it.
- **Keyboard shortcuts** — `Ctrl+K` palette, `Ctrl+Tab`/`Ctrl+1-9` session navigation, `Ctrl+T` new, `Ctrl+W` close, `Ctrl+Shift+[/]` workspaces. Full list in [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md).
- **Command palette** — `Ctrl+K` (`Cmd+K` on macOS) opens fuzzy search across workspaces, sessions, and quick actions.

## Notifications

Notifications use a 4-value `NotificationKind` enum (filtered emission, no idle PTY noise):

| Kind                  | Trigger                                                                       |
| --------------------- | ----------------------------------------------------------------------------- |
| `request-complete`    | A Claude session transitions from `running` to `finished` (request done).     |
| `user-input-required` | Buffer ends with a deterministic prompt marker (`[y/N]`, `Press any key`, sudo, OSC 133, `Do you want to allow…`). See `apps/main/src/notifications/detectUserInputRequired.ts`. |
| `permission-prompt`   | A session asks for out-of-scope file access (PathGrant request).              |
| `error`               | A session exits non-zero.                                                     |

Each notification fans out to both an in-app toast and (when the window is unfocused or minimized) an OS `Notification`. Clicking a workspace tile clears its notifications.

## Requirements

- Node 20+ (tested on 22)
- pnpm 11+ (enable via `corepack enable && corepack prepare pnpm@latest --activate`)
- On Windows: Build Tools for Visual Studio (for `node-pty` rebuild)
- On macOS/Linux: Python 3 + a C++ toolchain

## Setup

```bash
pnpm install
```

This pulls `@homebridge/node-pty-prebuilt-multiarch` (a `node-pty` fork that ships prebuilt binaries for win32-x64, darwin-x64/arm64, linux-x64/arm64). No native compilation, no Electron ABI rebuild — dodges the historic `node-pty` install pain entirely.

If you're on an unsupported architecture and the prebuild fetch fails, fall back to upstream `node-pty` + `@electron/rebuild` (see `package.json` history).

## Development

```bash
pnpm dev            # start electron-vite dev (HMR for renderer)
pnpm typecheck      # tsc -p tsconfig.json
pnpm lint           # ESLint flat config
pnpm format         # Prettier write
pnpm test           # Vitest unit tests
pnpm test:e2e       # Playwright smoke test
```

## Keyboard shortcuts

`$mod` = **Cmd** on macOS, **Ctrl** on Windows / Linux. Shortcuts no-op when focus is inside an input or a terminal pane.

| Key                     | Action                              |
| ----------------------- | ----------------------------------- |
| `$mod + K`              | Command palette                     |
| `$mod + T`              | New session (last-used type)        |
| `$mod + W`              | Close active session                |
| `$mod + Tab` / `Shift+Tab` | Cycle session within workspace   |
| `$mod + 1` … `$mod + 9` | Jump to session N (current workspace) |
| `$mod + Shift + ]` / `[` | Next / previous workspace          |
| `$mod + R`              | Rename active tab                   |
| `F2`                    | Rename active workspace             |
| `$mod + \`              | Cycle layout (single / grid / split) |

Full reference: [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md).

## Build

```bash
pnpm build          # electron-vite production build (out/main, out/preload, out/renderer)
pnpm package        # build + electron-builder (nsis / dmg / AppImage)
pnpm package:dir    # unpacked build for local testing
```

### Windows packaging caveat

`electron-builder` extracts its `winCodeSign` toolchain on first run; the archive contains darwin `.dylib` symlinks that Windows refuses to create without Developer Mode or an Administrator shell. Enable Windows Developer Mode (Settings → Privacy & Security → For developers → Developer Mode → On) before running `pnpm package` for the first time. CI runners and macOS/Linux are unaffected.

## Architecture

```
apps/main/          # Electron main process (Node)
apps/preload/       # contextBridge surface (typed window.ws.*)
apps/renderer/      # React 19 + Tailwind 4 UI
packages/shared/    # Zod IPC schemas + types shared by main and renderer
```

Core invariants:

- **Zod at the IPC boundary** — every channel is defined and validated by a Zod schema in `packages/shared/src/ipc.ts`, imported on both sides. Detail: [docs/architecture/ipc.md](docs/architecture/ipc.md).
- **Sandboxed renderer** — `contextIsolation: true`, `nodeIntegration: false`. The preload exposes a typed `window.ws.*` surface only.
- **Live design tokens drive xterm** — CSS custom properties on `:root` (Tailwind 4 `@theme`) re-theme every live terminal on change, no session remount. Detail: [docs/architecture/pty.md](docs/architecture/pty.md).
- **PTY = `@homebridge/node-pty-prebuilt-multiarch`** — prebuilt N-API binaries, no ABI rebuild on Electron upgrades. Detail: [docs/architecture/pty.md](docs/architecture/pty.md).
- **Workspace.rootPath = scope boundary** — out-of-scope access goes through the `PathGrant` flow. Detail: [docs/how-to/grant-out-of-scope-path.md](docs/how-to/grant-out-of-scope-path.md).

## Documentation

Canonical entry point: [docs/index.md](docs/index.md) — Diátaxis-organised, lists every page by quadrant. New users start with [docs/getting-started.md](docs/getting-started.md). Contributors read [docs/CONVENTIONS.md](docs/CONVENTIONS.md).

## Code signing

Not configured. TODO before public distribution:

- Windows: a code-signing certificate + `CSC_LINK` / `CSC_KEY_PASSWORD` env vars
- macOS: an Apple Developer ID + notarization via `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`

## Supported escape sequences

The renderer loads the full xterm.js addon stack — every terminal pane in SupaWorkspace recognises these protocol extensions out of the box.

| Sequence | Source | What it does | Addon | Default |
|---|---|---|---|---|
| Sixel (`DCS q ... ST`) | chafa, viu, ImageMagick | inline raster | @xterm/addon-image | enabled |
| iTerm2 inline image (`OSC 1337;File=...`) | imgcat | inline raster | @xterm/addon-image | enabled |
| OSC 9;4 progress (`ESC ] 9 ; 4 ; <state> ; <value> BEL`) | npm, cargo, winget, apt (recent) | pane progress pill | @xterm/addon-progress | enabled |
| OSC 52 clipboard write (`ESC ] 52 ; c ; <base64> BEL`) | tmux, vim, nvim yank | copy to host | @xterm/addon-clipboard | enabled |
| OSC 52 clipboard read | same | host-to-CLI paste | @xterm/addon-clipboard | disabled (security) |

The OSC 52 read direction is gated by `clipboard.allowOscRead` in app settings (`settings:get` / `settings:update` IPC). Toggling either clipboard flag hot-reloads only the `ClipboardAddon` — the terminal stays mounted, no scrollback loss.

## License

UNLICENSED — private project.
