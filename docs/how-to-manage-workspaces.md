---
type: how-to
updated: 2026-05-11
---

# Manage workspaces

A workspace is a folder on disk plus the sessions, color, and permissions scoped to it. This page walks through every workspace-management action.

## Create a workspace

Click **+ Open** in the sidebar header (or use the welcome screen). A native folder picker appears. Pick any folder.

- A new workspace is created with a name (the folder's basename), a `rootPath`, an auto-assigned color from the 8-hue OKLCH palette (the picker maximizes hue distance from existing workspaces), and empty `permissions`.
- The new workspace is set active.

## Rename a workspace

Two ways:

- **Double-click** the workspace tile name in the sidebar — an inline input opens. Type, then **Enter** (commit) or **Esc** (cancel). Blur also commits.
- **Settings icon** on hover (top-right of the tile) → **Rename**.

The rename is persisted via the `workspace:rename` IPC channel.

## Change workspace color

Hover the tile, click the **Settings** icon, then click a swatch in the **Color** palette. The active hue is shown ringed. Both the tile pill and the active terminal's left border update immediately.

## Delete a workspace

Hover the tile, click the **Settings** icon, then click **Delete workspace**. A confirmation toast appears with **Delete** / **Cancel**.

On confirm, the delete cascade fires:

1. All PTY sessions in this workspace are killed (`SessionManager.killAllInWorkspace`).
2. The workspace is removed from `electron-store`.
3. Its `PathGrant[]` are discarded with the workspace record.
4. Its notifications are cleared from the in-app store.

There is **no soft-delete** and **no undo**. The confirm modal is the only guard.

## Conflict handling

### Same folder opened twice

If you pick a folder that's already a workspace, `openOrCreate` returns the existing record. The UI shows an info toast — *"Already open as `<name>`"* — and switches to that workspace. No duplicate is created.

### Workspace deleted while sessions are running

Covered by the delete cascade above. Active sessions are killed cleanly before the workspace record is removed.

### Same path granted in multiple workspaces

If you grant out-of-scope access to the same absolute path in two workspaces, the **Permissions** tab of the Settings panel shows a warning banner listing each path + the workspaces it's granted in (and the `kind` — `read` or `write`). Revoke the duplicates manually via **Revoke** on each grant.

You can also query `window.ws.permissions.grantConflicts()` from a console to inspect the full conflict list.
