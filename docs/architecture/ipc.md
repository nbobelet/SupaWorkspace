---
type: explanation
updated: 2026-05-12
---

# IPC boundary — Zod everywhere

SupaTerminal is an Electron app, which means there is a hard boundary between two JavaScript processes: the **main process** (Node, full filesystem and PTY access) and the **renderer process** (Chromium, sandboxed, no Node). They communicate over Electron's `ipcRenderer` ↔ `ipcMain` channels. Every byte that crosses that boundary is serialized through `postMessage` and arrives on the other side as `unknown`.

The shape of this document is **why it works this way**, not how to use it. For day-to-day calls, the typed `window.ws.*` surface in [`apps/preload/src/index.ts`](../../apps/preload/src/index.ts) is self-documenting — pick a method, hit *Go to definition*, you land on the schema.

## The problem

A naïve Electron app does this:

```ts
ipcMain.handle('session:spawn', async (_, req) => {
  // req is `any` — anything could be in it
  return spawnPty(req.workspaceId, req.type, req.cols, req.rows)
})
```

That is one bug away from a `ReferenceError` at runtime, two bugs away from a security hole, and three bugs away from a crashed main process. The renderer can send anything — including nothing, including the wrong types, including malicious values — and the handler runs.

The TypeScript types help on the **renderer** side, where the IDE shows the expected shape. They do nothing on the **main** side, where the payload arrives across a process boundary and `tsc` has no idea what was actually sent.

## The fix — one schema, two consumers

Every IPC payload has exactly one Zod schema, in [`packages/shared/src/ipc.ts`](../../packages/shared/src/ipc.ts). The schema is imported by **both** main and renderer. The contract is the schema; everything else is derived from it.

```ts
// packages/shared/src/ipc.ts
export const SessionSpawnRequest = z.object({
  workspaceId: z.string().uuid(),
  type: SessionType,
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
  label: z.string().optional(),
})
export type SessionSpawnRequest = z.infer<typeof SessionSpawnRequest>
```

The handler in main parses the incoming payload before doing anything with it:

```ts
// apps/main/src/ipc/session.ts (shape)
ipcMain.handle(IpcChannel.SessionSpawn, async (_, raw) => {
  const req = SessionSpawnRequest.parse(raw) // throws if invalid
  return spawnPty(req)
})
```

Three consequences fall out of this discipline:

1. **No `any` ever reaches the handler body.** If the renderer sent garbage, `parse` throws *before* `spawnPty` runs. The throw becomes a rejected promise on the renderer side.
2. **Validation rules live with the type.** `cols` is not just a `number` — it is `int, ≥ 1, ≤ 1000`. The renderer sees that contract through the inferred type, but the main process **enforces** it at runtime. You cannot drift one without breaking the other.
3. **Single source of truth.** Renaming a field, adding a new one, tightening a constraint — all three happen in one file. Both processes recompile against the new shape. There is no second declaration to keep in sync.

## The channel registry

Channel names are not free-form strings. They live in a single `as const` object:

```ts
export const IpcChannel = {
  SessionSpawn: 'session:spawn',
  SessionWrite: 'session:write',
  // ...
} as const
export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]
```

This buys two things:

- **No typo on either side.** Both `ipcMain.handle(IpcChannel.SessionSpawn, ...)` and `ipcRenderer.invoke(IpcChannel.SessionSpawn, ...)` reference the same constant. A typo is a TypeScript error, not a silent failure where the handler never fires.
- **Discoverable surface area.** Every channel the app exposes is in one place — 30-ish entries, scannable in under a minute. Adding a new channel means adding a line here, which makes it visible in code review.

## The preload bridge — typed by inference, not duplication

The preload script exposes the IPC surface to the renderer under `window.ws`. The naïve way is to hand-write a type for `window.ws` and trust nobody breaks it. We do not do that.

Instead, the preload builds the API object and **exports its inferred type**:

```ts
// apps/preload/src/index.ts (shape)
const api = {
  session: {
    spawn: (req: SessionSpawnRequest): Promise<SessionSpawnResponse> =>
      ipcRenderer.invoke(IpcChannel.SessionSpawn, req),
    // ...
  },
  workspace: { /* ... */ },
  permissions: { /* ... */ },
  // ...
} as const

contextBridge.exposeInMainWorld('ws', api)

export type ClaudeWorkspaceApi = typeof api
```

The renderer declares the global with that inferred type:

```ts
// apps/renderer/src/global.d.ts (shape)
declare global {
  interface Window {
    ws: ClaudeWorkspaceApi
  }
}
```

Every method, every argument, every return shape on `window.ws.*` is the type the preload *actually built*. There is no separate declaration to drift. If you add a new method to `api` in the preload, the renderer sees it on the next `tsc` run — and only then.

## Events — same pattern, opposite direction

Main-to-renderer events (data streaming, state transitions, exits) are validated symmetrically. The emit site builds a typed event:

```ts
// shape
const event: SessionDataEvent = { sessionId, data: chunk }
mainWindow.webContents.send(IpcChannel.SessionData, event)
```

The renderer subscribes through a helper that types the listener payload:

```ts
window.ws.session.onData((event) => {
  // event: SessionDataEvent
  terminal.write(event.data)
})
```

The helper `on<T>` in the preload is generic over the event type — the channel-to-payload mapping is encoded once, at the preload boundary, and the renderer cannot subscribe to a channel with the wrong handler shape.

> **Note**: incoming events from main are **not** re-parsed by the renderer. The main process is trusted (we wrote it); only the *inbound* direction at the main boundary is validated. If you ever expose IPC to a less-trusted source (a worker, a remote process), parse on both sides.

## The sandbox half of the deal

The IPC discipline only matters if the renderer cannot bypass it. In `apps/main/src/index.ts` the `BrowserWindow` is created with:

```ts
new BrowserWindow({
  webPreferences: {
    contextIsolation: true,   // renderer cannot touch preload's globals
    nodeIntegration: false,   // no `require`, no `process` in renderer
    sandbox: true,            // OS-level sandbox where supported
    preload: path.join(__dirname, '../preload/index.js'),
  },
})
```

`contextIsolation: true` is the load-bearing one. Without it, the renderer's JavaScript context and the preload's context are the same — meaning the renderer could mutate `window.ws`, replace `ipcRenderer.invoke`, or otherwise reach around the typed surface. With it on, `window.ws` is the **only** thing the renderer sees from the preload; everything else is unreachable.

The whole IPC pattern collapses if any of these three flip — `contextIsolation: false`, `nodeIntegration: true`, or a missing `preload`. They are wired together by design.

## When you add a new IPC channel

The procedure is mechanical, by intent:

1. Add the channel name to `IpcChannel` in `packages/shared/src/ipc.ts`.
2. Add the request schema (and the response schema if there is a return value). Export both the schema and the `z.infer` type.
3. Add a handler in `apps/main/src/ipc/<area>.ts` that calls `Schema.parse(raw)` as its first line.
4. Add a method to `api` in `apps/preload/src/index.ts` that calls `ipcRenderer.invoke(IpcChannel.X, req)` with the typed argument.
5. Use `window.ws.<area>.<method>(req)` from the renderer.

If step 3 is missing the `.parse` call, the boundary is leaky — the handler will accept malformed payloads and crash deeper in. Code review for new IPC channels checks for the `.parse` line specifically.

## What this pattern costs

- **A second schema definition every time.** Plain TypeScript types would be one line; a Zod schema is several. The cost is real and we pay it deliberately.
- **A `parse` call in the hot path of every handler.** Negligible for typical payloads, measurable for very large or very chatty streams. PTY data events use a typed payload but skip the per-event `parse` on the renderer side for this reason.
- **Coupling to Zod.** If we ever migrate to a different schema library (Valibot, Effect/Schema, Standard Schema), every channel definition changes. The single source of truth makes the migration mechanical but not free.

We accept the cost because the alternative — `any` at the process boundary — is the bug class that produces the worst outages: silent payload corruption, crashes in main that take down the whole app, and security regressions that are invisible at compile time.

## See also

- `packages/shared/src/ipc.ts` — the schemas.
- `apps/preload/src/index.ts` — the bridge that exposes `window.ws`.
- `apps/main/src/ipc/` — handlers, one file per area (`session.ts`, `notes.ts`, …).
- [concepts.md](../concepts.md) — what `Workspace`, `Session`, `Type` mean across this boundary.
