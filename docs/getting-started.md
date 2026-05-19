---
type: tutorial
updated: 2026-05-12
---

# Getting started

This is the 10-minute walkthrough for someone who just installed SupaTerminal and wants to feel the app for the first time. By the end you will have opened a workspace, spawned a Claude session, watched it run a tool, and seen the notification system fire.

This page is a **tutorial** in the Diátaxis sense — follow the steps in order, do not skip. Reference material lives in [keyboard-shortcuts.md](./keyboard-shortcuts.md); conceptual background lives in [concepts.md](./concepts.md); task-oriented recipes live in [how-to/manage-workspaces.md](./how-to/manage-workspaces.md).

## What you need

- SupaTerminal installed and launched (see [README.md](../README.md) for setup).
- A folder on disk you do not mind opening — a small repo, a scratch directory, anything. We will call it `~/scratch` in this guide.
- The `claude` CLI installed and on your `PATH` (`which claude` should print a path). The shell session steps work without it, the Claude session steps do not.

## Step 1 — Open your first workspace

When SupaTerminal starts with no workspaces, you see a welcome screen with an **Open folder** button. Click it.

A native folder picker opens. Pick `~/scratch` (or whichever folder you chose). Press **Open**.

What just happened:

- A new workspace was created. Its name is the folder's basename (`scratch`).
- It was assigned a color from an 8-hue palette. You will see the color on the workspace tile in the sidebar and as a left border on the active terminal pane.
- It was set active. The sidebar now shows one workspace tile, highlighted.
- The folder path you picked became the workspace's `rootPath` — its **scope boundary**. Every session you spawn here will start in this folder and inherit its permissions.

> The folder is **not** copied or modified. SupaTerminal only remembers the path. Closing the app does not delete anything.

## Step 2 — Spawn a shell session

Look at the empty pane in the middle of the window. There is a **New session** button with a dropdown — click the dropdown and pick **shell**.

A new tab appears at the top of the pane and a shell prompt appears inside it. You are now in `~/scratch` with your default login shell running through a PTY.

Try a command:

```
ls
```

You should see the folder's contents. This is a real PTY, not a stripped-down shell — colors, prompts, `vim`, `htop`, all work normally.

> The session is **scoped** to this workspace. If you create a second workspace later, your shell tab here will stay here — it will not bleed across.

## Step 3 — Spawn a Claude session

Click the **+** button to the right of the tabs (or press `Ctrl+T` / `Cmd+T` on macOS). The dropdown remembers your last choice; click the dropdown arrow and pick **claude** instead.

A second tab appears. The Claude CLI launches inside it, running in `~/scratch` as its working directory.

When Claude is ready, type a prompt at the bottom input bar and press **Enter**:

```
Create a file named hello.txt with the line "hi from SupaTerminal" inside it.
```

Claude will think for a moment, then ask to run a tool — likely `Write` or `Bash`. **Approve it** when the prompt appears in the terminal pane (`y` / `Enter`).

Two things happen behind the scenes:

1. Claude writes the file via its `Write` tool. Because the file is inside `~/scratch` (the workspace's `rootPath`), no permission dialog appears.
2. When the request completes, the session transitions from `running` to `finished`. SupaTerminal emits a **`request-complete`** notification.

If your SupaTerminal window is focused, you see a Sonner toast top-right. If you Alt-Tabbed away, you also get a native OS notification. The bell badge on the workspace tile lights up. Click the workspace tile to clear it.

## Step 4 — Trigger a permission prompt

Now ask Claude to do something **outside** the workspace:

```
Read the file /etc/hostname and tell me what's in it.
```

(On Windows, substitute a path outside `~/scratch`, for example `C:\Windows\System32\drivers\etc\hosts`.)

Claude will request `Read` access to a path that is **not** inside the workspace's `rootPath`. SupaTerminal intercepts this through its `PathGrant` system and pops a native dialog:

```
Allow Claude to read /etc/hostname?
  [ Deny ]  [ Allow once ]  [ Always allow ]
```

- **Deny** — refuse this one request.
- **Allow once** — let this request through but do not remember it.
- **Always allow** — persist a `PathGrant` on this workspace; future reads of the same path go through without asking.

Pick **Allow once** for now. Claude reads the file. The session emits another `request-complete` notification.

> All grants are inspectable and revocable from **Settings → Permissions**. They survive app restarts because they are persisted to `electron-store` alongside the workspace record.

## Step 5 — Two sessions, one workspace

You now have a `shell` tab and a `claude` tab inside the `scratch` workspace. Try the navigation shortcuts:

- `Ctrl+Tab` (or `Cmd+Tab` on macOS) cycles to the next session.
- `Ctrl+1` and `Ctrl+2` jump directly to tabs 1 and 2.
- `Ctrl+\` cycles through layouts — single pane → grid → split. Switch to **split** to see both sessions side by side.
- `Ctrl+K` (or `Cmd+K`) opens the command palette. Fuzzy-search for *"new claude"* or *"rename"* and try it.

The full reference is in [keyboard-shortcuts.md](./keyboard-shortcuts.md).

## Step 6 — A second workspace

Click the **+ Open** button in the sidebar header. Pick a second folder — say `~/another-project`.

A second workspace tile appears in the sidebar, with a different color (the picker maximizes hue distance, so the two never look alike). It becomes active.

The tab strip is now empty — your `shell` and `claude` tabs from `scratch` are **still alive**, they are just hidden because they belong to a different workspace. Switch back to `scratch` using `Ctrl+Shift+[` (previous workspace) — your tabs reappear, the PTYs are still running, the scrollback is intact.

> Per-workspace tab scoping is the central design choice of SupaTerminal — no cross-workspace bleed, ever. See `Workspace` in [concepts.md](./concepts.md) for the formal definition.

## Step 7 — Where to go next

You have now exercised every core concept: workspaces, sessions, types, scope, permissions, notifications, layouts. From here:

- **Recipes for everyday tasks** — [how-to/manage-workspaces.md](./how-to/manage-workspaces.md) covers renaming, recoloring, deleting, conflict handling.
- **Full keyboard reference** — [keyboard-shortcuts.md](./keyboard-shortcuts.md).
- **What each word means in the codebase** — [concepts.md](./concepts.md).
- **Why the IPC layer looks the way it does** — [architecture/ipc.md](./architecture/ipc.md).

## What you should be able to do now

Without re-reading this page:

- [ ] Open a folder as a workspace.
- [ ] Spawn a `shell` session and run commands in it.
- [ ] Spawn a `claude` session and ask it to write a file inside the workspace.
- [ ] Approve a permission prompt for an out-of-scope path.
- [ ] Navigate between sessions with `Ctrl+Tab` and `Ctrl+1` … `Ctrl+9`.
- [ ] Switch between two workspaces and confirm tabs do not bleed.
- [ ] Find the notification bell on a workspace tile and clear it.

If any of these still feel uncertain, redo that step before moving on.
