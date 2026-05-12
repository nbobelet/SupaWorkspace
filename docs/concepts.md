---
type: explanation
updated: 2026-05-12
---

# Concepts

```
Workspace (folder + path grant)
  └─ Session (PTY instance: state, label, history)
       └─ Type: claude | shell | terminal
```

This page pins the three names the rest of the codebase, IPC contract, UI, and docs build on. If you see one of these words elsewhere, it means exactly what is described below — there are no synonyms.

## Workspace

A **Workspace** is a folder you opened in SupaTerminal, paired with a `PathGrant` for that folder. The path is the **scope boundary**: every Session spawned inside a Workspace inherits its `cwd` and its permissions. Out-of-scope file access — for example a Claude tool call that wants to read a sibling directory — triggers a permission prompt and, on approval, persists as an extra grant on the Workspace. Workspaces survive app restarts via `electron-store`; their grants travel with them.

## Session

A **Session** is one running PTY process owned by a Workspace. It has a stable id, a label (which the user can rename inline), a state (`idle` / `running` / `waiting-for-input` / `finished` / `error`), a command history, and a tab in the strip at the top of the active Workspace. Sessions are scoped to their Workspace — switching Workspaces hides their tabs, it does not close them. PTY processes themselves do **not** survive an app restart; only their metadata (label, order) is snapshotted to `sessions-snapshot` and replayed on next launch as fresh PTYs.

## Type

A **Type** is the program a Session is running. Three values exist today: `claude` (the Claude CLI), `shell` (your default login shell), and `terminal` (a generic PTY without a CLI hook). The Type is chosen at spawn time and never changes for the lifetime of a Session. Most keyboard shortcuts and UI actions operate on the active Session regardless of Type; a few features — for example the `running` / `waiting-for-input` priority surface — are most meaningful when the Type is `claude`.

## Where each lives

| Concept   | Persisted                | Survives restart | Scope                  |
| --------- | ------------------------ | ---------------- | ---------------------- |
| Workspace | `electron-store`         | Yes              | App-wide               |
| Session   | `sessions-snapshot` only | Metadata only    | Inside one Workspace   |
| Type      | Inside the Session       | With the Session | Inside one Session     |

Keyboard shortcuts in [keyboard-shortcuts.md](./keyboard-shortcuts.md) are grouped by which concept they act on (`App` / `Active workspace` / `Active session`).
