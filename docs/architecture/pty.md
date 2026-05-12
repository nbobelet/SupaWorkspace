---
type: explanation
updated: 2026-05-12
---

# PTY backend — why a fork, why prebuilt, why these trade-offs

Every terminal pane you see in SupaTerminal is backed by a real PTY — a pseudoterminal pair (master/slave) owned by the main process, with the master end piped to the renderer through IPC and the slave end attached to a child process (`claude`, your shell, or whatever Type the session was spawned with). This page explains the choices that shape that pipeline, the historical pain they avoid, and the platform quirks that remain.

## The PTY library — `@homebridge/node-pty-prebuilt-multiarch`

The upstream library for spawning PTYs from Node is [`node-pty`](https://github.com/microsoft/node-pty). It is a native addon — a C++ binding to platform PTY APIs (`forkpty` on Unix, ConPTY on Windows). Native addons in Node are **ABI-coupled** to the Node version they were built against.

Electron ships its own Node version. Every Electron release potentially bumps Node, which means every native addon needs to be rebuilt against Electron's Node ABI before it can be `require`d from main. The historical pain looks like this:

1. `pnpm install` runs `node-pty`'s install hook → builds the addon against your **system** Node.
2. You run `pnpm dev` → Electron loads the addon → ABI mismatch → cryptic `Error: NODE_MODULE_VERSION` crash.
3. You add `@electron/rebuild` to your build pipeline → it rebuilds the addon against Electron's Node → works.
4. You bump Electron → rebuild again → works.
5. Different developers' machines build slightly different binaries → CI builds fail intermittently → you start checking in `node_modules`.

We dodge all of that by using `@homebridge/node-pty-prebuilt-multiarch` — a fork of `node-pty` that ships **prebuilt N-API binaries** for the common platforms: `win32-x64`, `darwin-x64`, `darwin-arm64`, `linux-x64`, `linux-arm64`.

Two properties make this work:

- **Prebuilt** — no compile step on `pnpm install`. The right binary is downloaded for your platform.
- **N-API** — the [Node-API](https://nodejs.org/api/n-api.html) is ABI-stable across Node versions. The same `.node` file works on Node 18, 20, 22, and Electron 28, 33, 36 — until Node breaks N-API itself, which has not happened in years.

The combined effect: `pnpm install` finishes in seconds on every supported platform, with zero native build toolchain required for development. Setup pain is gone.

> When prebuilt fetch fails (e.g. an architecture the fork does not ship), fall back to upstream `node-pty` + `@electron/rebuild`. The `package.json` history records the original wiring.

We pin the fork via `patches/` (pnpm patch protocol) so we can apply small fixes without forking the fork.

## The spawn flow

`SessionManager.spawn` (`apps/main/src/pty/SessionManager.ts`) is the single entry point for creating a PTY. Its inputs are:

- `workspaceId` — for tagging events.
- `rootPath` — used as the `cwd` of the spawned process. This is what makes "the workspace's scope" concrete on disk.
- `type` — `claude` | `shell` | `terminal`. Resolved into a `(command, args)` pair internally.
- `cols` / `rows` — initial terminal size; the renderer measures the pane and sends real values.

The spawn line itself is conventional:

```ts
const pty = ptySpawn(command, args, {
  name: 'xterm-256color',
  cols, rows,
  cwd: opts.rootPath,
  env: process.env as Record<string, string>,
})
```

Two callbacks attach immediately:

- `pty.onData(chunk)` — forwards to `StateDetector.onData` (for `running` / `asking` classification) and to the renderer via `session:data`.
- `pty.onExit({ exitCode, signal })` — forwards to `StateDetector.onExit`, then to the renderer via `session:exit`, then unregisters the session locally.

The renderer wires the inverse: every keystroke or paste goes through `session:write` and lands on `pty.write`. Resize events fire `session:resize` and land on `pty.resize`.

## State detection — why it lives in main, not renderer

The renderer hosts xterm.js and could parse buffer state from its own scrollback. We do not do that. State detection (`apps/main/src/pty/stateDetector.ts`) runs in main, on the raw byte stream, before the renderer ever sees it.

Three reasons:

1. **Single source of truth.** Multiple renderer panes might display the same session (split layout, future floating windows). They must all agree on `running` vs `asking`.
2. **Notifications fire from main.** `Notifier` (see [notifications.md](./notifications.md)) consumes state transitions to decide when to alert the user. Putting detection in the renderer would mean an IPC round-trip per state check.
3. **Survives reload.** If the renderer hot-reloads in dev, the session's last-known state is preserved in main and re-emitted on reconnect.

## Persistence — what survives a restart, what does not

- **PTY processes** — do **not** survive an app restart. When you quit SupaTerminal, every PTY is killed (`SessionManager.killAllInWorkspace` runs in the workspace-delete path; app quit kills the whole tree by process-group). This is intentional: a PTY is stateful in a way we cannot reliably checkpoint (in-flight command state, child processes, terminal modes, cursor position).
- **Session metadata** — survives via `sessions-snapshot`. The snapshot records `{ workspaceId, id, type, label, order }` for each session and is replayed on next launch as **fresh PTYs**. Your tabs come back; the previous PTY output does not.
- **Scrollback** — lives in xterm.js's in-memory buffer in the renderer. Lost on reload. This is the same trade-off every web-based terminal makes.

## Windows-specific quirks

### ConPTY's `conpty_console_list_agent.js`

On Windows, `node-pty` uses ConPTY (the Win32 PTY API introduced in Windows 10 1809). ConPTY needs to enumerate console-attached PIDs during cleanup, so `node-pty` spawns an auxiliary Node process — `conpty_console_list_agent.js` — that calls `AttachConsole`.

In an Electron main process **detached from a console**, that `AttachConsole` call fails and the agent crashes. The crash is logged by Windows.

This is cosmetic. The actual PTY (the user-visible terminal) is unaffected — the agent's only job is post-mortem cleanup, and the cleanup happens anyway when the parent exits. We deliberately do **not** log or surface this to the user. Suppressing it noisily would imply something is broken; it is not.

If you see a stack-dump file (e.g. `bash.exe.stackdump`) in the repo root after a dev session, it is from a different cause — usually a Cygwin/MSYS shell crashing inside the bundled `bash`. Safe to delete.

### Path encoding

`node-pty` on Windows passes `cwd` to `CreateProcess` as a UTF-16 string. Workspace paths with non-ASCII characters (`é`, CJK, emoji) work, but only if `electron-store` round-trips them correctly. The Zod schema for `Workspace.rootPath` is `z.string()` with no encoding constraint; we rely on Node's default UTF-8 ↔ UTF-16 conversion. No known issues in the wild — but if a user reports a workspace that opens with garbled prompts, this is the first thing to suspect.

## Resource limits

There is no explicit cap on concurrent PTYs. The OS imposes its own (typically 1024 file descriptors per process on Linux/macOS; harder to enumerate on Windows). In practice a workspace with more than 20 sessions becomes unusable in the UI long before resource exhaustion bites.

If you want a hard cap, the place to add it is `SessionManager.spawn` — fail fast with a clean error before calling `ptySpawn`. We have not needed it.

## See also

- `apps/main/src/pty/SessionManager.ts` — spawn / write / resize / kill.
- `apps/main/src/pty/stateDetector.ts` — running / asking / idle classification.
- `apps/main/src/sessions-snapshot/` — the metadata snapshot.
- [notifications.md](./notifications.md) — how state transitions become user-visible.
- [ipc.md](./ipc.md) — the `session:*` channels.
