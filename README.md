# ClaudeWorkspace

Multi-session terminal workspace manager for the `claude` CLI and shell sessions. Built with Electron, React 19, xterm.js, and node-pty.

A workspace is a folder on disk. Sessions spawned inside a workspace inherit its scope (cwd + permissions). Switch between single / grid / split layouts without losing live terminal state.

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

## Build

```bash
pnpm build          # electron-vite production build (out/main, out/preload, out/renderer)
pnpm package        # build + electron-builder (nsis / dmg / AppImage)
pnpm package:dir    # unpacked build for local testing
```

## Architecture

```
apps/main/          # Electron main process (Node)
apps/preload/       # contextBridge surface
apps/renderer/      # React 19 + Tailwind 4 UI
packages/shared/    # Zod IPC schemas + types shared by main and renderer
```

IPC channels are defined and validated with Zod in `packages/shared/src/ipc.ts`. Both sides import the same schemas — drift is impossible.

The renderer is sandboxed: `contextIsolation: true`, `nodeIntegration: false`. The preload exposes a typed `window.ws.*` surface only.

## PTY backend

We use `@homebridge/node-pty-prebuilt-multiarch` instead of upstream `node-pty` because it ships prebuilt N-API binaries for the common platforms. Electron loads the N-API binary directly — no ABI rebuild required when Electron's Node version changes.

Verify with:

```bash
pnpm dev
# look for "[pty] hello world ok" in the main process logs
```

### Known noise on Windows

On Electron + ConPTY, `node-pty` spawns an auxiliary `conpty_console_list_agent.js` child process to enumerate console-attached PIDs for cleanup. In an Electron main process detached from a console, this agent's `AttachConsole` call fails and the child crashes. **This is cosmetic** — the actual PTY operations are unaffected. We do not log nor surface this to the user.

## Code signing

Not configured. TODO before public distribution:

- Windows: a code-signing certificate + `CSC_LINK` / `CSC_KEY_PASSWORD` env vars
- macOS: an Apple Developer ID + notarization via `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD`

## License

UNLICENSED — private project.
