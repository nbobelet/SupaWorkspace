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
pnpm typecheck      # tsc -b --noEmit across the monorepo
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
apps/preload/       # contextBridge surface
apps/renderer/      # React 19 + Tailwind 4 UI
packages/shared/    # Zod IPC schemas + types shared by main and renderer
```

IPC channels are defined and validated with Zod in `packages/shared/src/ipc.ts`. Both sides import the same schemas — drift is impossible.

The renderer is sandboxed: `contextIsolation: true`, `nodeIntegration: false`. The preload exposes a typed `window.ws.*` surface only.

### Renderer — xterm.js addons

The terminal pane loads the full official xterm.js addon stack via the pure factory `apps/renderer/src/terminal/buildAddons.ts`, in this canonical order: WebGL, Ligatures, Web-Fonts, Unicode-Graphemes (v15), Image (SIXEL + iTerm IIP), Progress (OSC 9;4), Clipboard (OSC 52), Search, Serialize, Web-Links, Fit. The WebGL renderer registers an `onContextLoss` handler that disposes the addon — xterm then falls back to its built-in DOM renderer automatically, so terminal output is never lost.

## PTY backend

We use `@homebridge/node-pty-prebuilt-multiarch` instead of upstream `node-pty` because it ships prebuilt N-API binaries for the common platforms. Electron loads the N-API binary directly — no ABI rebuild required when Electron's Node version changes.

Verify with:

```bash
pnpm dev
# look for "[pty] hello world ok" in the main process logs
```

### Known noise on Windows

On Electron + ConPTY, `node-pty` spawns an auxiliary `conpty_console_list_agent.js` child process to enumerate console-attached PIDs for cleanup. In an Electron main process detached from a console, this agent's `AttachConsole` call fails and the child crashes. **This is cosmetic** — the actual PTY operations are unaffected. We do not log nor surface this to the user.

## Permissions model

A workspace's `rootPath` is the scope boundary. The renderer can request
out-of-scope access via:

```ts
const res = await window.ws.permissions.requestPath({
  workspaceId,
  path: '/some/absolute/path',
  kind: 'read' | 'write',
})
```

Resolution:

- If `path` resolves inside `workspace.rootPath` → auto-allow, no dialog.
- If a matching grant already exists in `workspace.permissions.extraPaths` → auto-allow.
- Otherwise → native `dialog.showMessageBox` shows the literal path with three buttons (Deny / Allow once / Always allow). "Always allow" persists a `PathGrant` on the workspace.

Grants are revocable from Settings → Permissions. Persistence lives in `electron-store` alongside the workspace itself, so grants survive app restarts.

The `claude` CLI's own per-tool permissions (`Bash(pnpm:*)`, `Read(./**)`, etc.) live in `<rootPath>/.claude/settings.json` and are edited through Settings → Permissions. Those are enforced by the `claude` CLI itself at tool-call time — the host app only writes the file.

## Documentation

The `docs/` tree is organised by [Diátaxis](https://diataxis.fr) quadrant:

| Quadrant     | Page                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| Tutorial     | [docs/getting-started.md](docs/getting-started.md) — 10-min walkthrough for first launch |
| How-to       | [docs/how-to-manage-workspaces.md](docs/how-to-manage-workspaces.md) — create / rename / recolor / delete |
| How-to       | [docs/how-to/configure-claude-settings.md](docs/how-to/configure-claude-settings.md) — per-workspace `.claude/settings.json` |
| How-to       | [docs/how-to/grant-out-of-scope-path.md](docs/how-to/grant-out-of-scope-path.md) — `PathGrant` lifecycle |
| Reference    | [docs/keyboard-shortcuts.md](docs/keyboard-shortcuts.md) — full key table         |
| Explanation  | [docs/concepts.md](docs/concepts.md) — `Workspace`, `Session`, `Type` definitions |
| Explanation  | [docs/architecture/ipc.md](docs/architecture/ipc.md) — Zod-at-the-boundary IPC pattern |
| Explanation  | [docs/architecture/notifications.md](docs/architecture/notifications.md) — dual-channel fan-out |
| Explanation  | [docs/architecture/pty.md](docs/architecture/pty.md) — PTY backend trade-offs     |

New users should start with [docs/getting-started.md](docs/getting-started.md).

## Code signing

Not configured. TODO before public distribution:

- Windows: a code-signing certificate + `CSC_LINK` / `CSC_KEY_PASSWORD` env vars
- macOS: an Apple Developer ID + notarization via `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`

## License

UNLICENSED — private project.
