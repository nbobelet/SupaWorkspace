---
type: explanation
updated: 2026-05-12
---

# Notifications — dual-channel fan-out

SupaTerminal emits exactly **four** kinds of notification, from exactly **one** source (the main process `Notifier`), to exactly **two** sinks (the in-app notification center and the OS notification daemon). This page explains why the architecture is shaped that way.

## The constraint

Terminal sessions are noisy. A `claude` session prints data continuously while it thinks. A `shell` session prints data continuously while you work. If we wired "PTY data event → toast", you would never use the app — you would be swimming in toasts.

We want notifications only for **events the user should care about**:

- "Claude finished thinking about your request."
- "Claude is blocked, waiting for you to type or click."
- "A path outside the workspace needs your approval."
- "A session crashed."

Those four events are the `NotificationKind` enum in [`packages/shared/src/notification.ts`](../../packages/shared/src/notification.ts). Adding a fifth means a new enum value, a new emit site in the main process, and a new icon path in the renderer — by design, so the surface stays small.

## The single emit point

All four kinds flow through `Notifier` (`apps/main/src/notifications/Notifier.ts`). Nothing else in the main process is allowed to emit notifications directly. This is enforced socially, not by a lint rule — but the file is small enough (≈120 lines) that any drift is immediately visible in code review.

The `Notifier` is wired to two upstream sources:

- **Session state transitions** (`StateDetector`) — when a session transitions `running → idle` (request complete) or `running → asking` (waiting for input), or exits with non-zero code (error), the `Notifier` is called with the session id and the new state.
- **Permission requests** (`PermissionGate` via the `permissions:request-path` handler) — when an out-of-scope path is requested, the handler calls `Notifier.emitPermissionPrompt` *before* opening the native dialog. That way the user sees both the dialog *and* a record in the notification center.

The `Notifier` keeps a `previousState` map per session and dedupes — `idle → idle` does not fire anything. Only true transitions emit.

## Two sinks, one decision

For every emit, the `Notifier` runs the same two steps:

1. **Always** send `IpcChannel.NotifPush` to the renderer. The renderer's `notificationStore` records it and shows a Sonner toast top-right. The bell badge on the workspace tile increments.
2. **Conditionally** show an `electron.Notification`. The condition is *"main window is unfocused or minimized"*:

   ```ts
   if (win.isFocused() && !win.isMinimized()) return
   if (!Notification.isSupported()) return
   new Notification({ title, body }).show()
   ```

The reason the OS notification is conditional and the in-app one is not: when you are looking at the app, the OS popup is redundant — the in-app toast is already in your eye line. When you are Alt-Tabbed away, the in-app toast is invisible — the OS notification is the only way to reach you.

This is the **dual-channel** pattern: one state change, two orthogonal sinks, each with its own when-to-fire rule. The pattern is portable — replace `electron.Notification` with the Web Notifications API and the same shape fits a PWA.

## Clicking an OS notification

When the user clicks the native OS popup, the `Notifier` runs a `click` handler:

1. If the window is minimized → `win.restore()`.
2. `win.focus()`.
3. Send `IpcChannel.SessionFocus` to the renderer with the session id and workspace id, so the UI scrolls the right tab into view and switches workspace if needed.

The OS-level "click to focus" only works because the `Notifier` has a closure over `getMainWindow()` — a function that returns the current `BrowserWindow` even after main has restarted internal references. Holding a direct reference would dangle.

## Why the four kinds, specifically

- **`request-complete`** — Claude has stopped streaming output. The user can now read the response and decide the next prompt. This is the most common notification; we keep it terse (`<session label>` only) because it fires often.
- **`user-input-required`** — Claude is blocked on a y/N, a `Press any key`, a sudo prompt, or an OSC 133 prompt marker. Detection lives in `detectUserInputRequired.ts` via a fixed list of regexes on the buffer tail (last 256 chars). False positives are rare enough that we tolerate them; missing a real prompt is much worse than firing one extra notification.
- **`permission-prompt`** — see above; fires alongside the native dialog so the user gets a persistent record after the dialog auto-dismisses.
- **`error`** — session exited non-zero. Includes the exit code in the body. This is the rare event; the rate is low enough that it can be loud.

Idle-prompt detection (`detectIdlePrompt.ts`) is **not** wired to notifications — it is used by the state machine to distinguish "session is sitting at a prompt" from "session is running a command". Notification emission only cares about transitions, not steady states.

## What this pattern costs

- **Two code paths to test.** The state-transition path goes through `StateDetector → Notifier.handleStateChange → emit + maybeNotify`. The permission path goes through `permissions.ts → Notifier.emitPermissionPrompt`. Both end in `webContents.send` + (optional) `new Notification`. Coverage requires fixtures for both.
- **Buffer tail regex matching on every PTY chunk.** `detectUserInputRequired` runs on every `pty.onData` callback. Profiled: under 50µs for a 256-char tail on a modern laptop, dwarfed by the React render of the terminal pane.
- **OS-specific dialog UX.** macOS's Notification Center is permissions-gated; if the user denies notifications system-wide, the OS-sink half of the dual channel is silently no-op. The in-app channel still works, so the feature degrades gracefully.

## See also

- `apps/main/src/notifications/Notifier.ts` — the emit logic.
- `apps/main/src/notifications/detectUserInputRequired.ts` — the prompt detection regexes.
- `apps/main/src/pty/stateDetector.ts` — what classifies a session as `running`, `asking`, etc.
- `apps/renderer/src/state/notificationStore.ts` — the renderer-side store and Sonner integration.
- [ipc.md](./ipc.md) — the `notif:push` channel.
