---
type: how-to
updated: 2026-05-12
---

# Grant out-of-scope filesystem access

A workspace's `rootPath` is its **scope boundary**. Any read or write *inside* that path is auto-allowed. Any read or write *outside* that path goes through the `PathGrant` flow described below.

This page covers the three points at which you interact with the flow: when a prompt appears, when you want to pre-grant a path, and when you want to revoke a grant.

## Approve a path the first time it is requested

When a Claude session asks to access a file outside the workspace, a native dialog appears:

```
Out-of-scope access requested
Session in "<workspace name>" wants to read a file outside the workspace.
<absolute path>

  [ Deny ]   [ Allow once ]   [ Always allow ]
```

Pick the button that matches your intent:

- **Deny** — refuse this single request. No persistence. The next request to the same path will prompt again.
- **Allow once** — let this request through. No persistence. The next request to the same path will prompt again.
- **Always allow** — let this request through **and** persist a `PathGrant` on the workspace. Future reads (or writes, depending on `kind`) of any path inside that grant go through silently.

A `permission-prompt` notification is also emitted in the in-app notification center — useful when the dialog appeared while you were focused on a different workspace.

## Revoke a grant

1. Make the workspace active.
2. Open **Settings** → **Permissions** tab.
3. The grants list shows each persisted `PathGrant`: `path`, `kind`, granted-at timestamp.
4. Click **Revoke** next to the grant you want to remove.

Revocation is immediate. The next out-of-scope request to that path will prompt again. Revocation does **not** kill in-flight operations — a Claude tool call that has already received the green light continues.

## Pre-grant a path you know you will need

There is no "Add grant" button in the UI by design — grants are only created by user-visible prompts, so you always see the path before approving it. To pre-grant:

1. Spawn a Claude session in the workspace.
2. Ask it to perform any small read on the path you want to grant — e.g. *"Read the first line of `<path>`"*.
3. When the dialog appears, click **Always allow**.

The grant now persists on the workspace. Subsequent sessions in the same workspace inherit it.

## Grant semantics

- **Read grant** — allows `read` access to the path and everything inside it. Does not allow writes.
- **Write grant** — allows both `read` and `write` access to the path and everything inside it.

The check is path-prefix based: a grant on `/Users/me/projects` covers `/Users/me/projects/foo/bar.txt`. A grant on `/Users/me/projects/foo` does **not** cover `/Users/me/projects/bar.txt`.

## Same path granted in two workspaces

If you grant access to the same absolute path from two different workspaces, the **Permissions** tab shows a conflict banner listing each path + the workspaces that hold it + the `kind` of each grant.

This is informational — both grants remain active. To clean up:

- Revoke the duplicate in each workspace that should not have it, **or**
- Leave both if both workspaces legitimately need access.

You can also inspect the conflicts programmatically from a renderer DevTools console:

```js
await window.ws.permissions.grantConflicts()
```

It returns `{ conflicts: PathGrantConflict[] }` — useful for scripting bulk cleanup.

## Where grants live on disk

Grants are stored in `electron-store` alongside the workspace record. The file is at the OS-standard Electron user-data location (`~/.config/SupaTerminal/config.json` on Linux, `~/Library/Application Support/SupaTerminal/config.json` on macOS, `%APPDATA%\SupaTerminal\config.json` on Windows).

You should not edit this file by hand. If you really need to wipe all grants for a workspace, **Delete workspace** (Settings icon → Delete) drops them; recreating the workspace gives you a fresh, grant-free record.

## See also

- [concepts.md](../concepts.md) — `Workspace` and the scope-boundary definition.
- [configure-claude-settings.md](./configure-claude-settings.md) — the *other* permissions layer (per-tool, enforced by the `claude` CLI itself).
- [../architecture/ipc.md](../architecture/ipc.md) — the `permissions:request-path` IPC channel.
