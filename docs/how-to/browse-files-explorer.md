---
type: how-to
updated: 2026-05-20
---

# Browse files with the Explorer

The **Explorer** sub-app is a macOS-Finder-style file browser for the active workspace. It lays out folders in horizontally-scrolling **Miller columns** — click a folder, its contents open in a new column to the right; click a file, its details appear in the rightmost panel. This page walks through opening it, navigating, reading the git decorations, and acting on entries.

## Contents

- [Open the Explorer](#open-the-explorer)
- [Navigate columns](#navigate-columns)
- [Read git status colors](#read-git-status-colors)
- [Use the context menu](#use-the-context-menu)
- [Scope & permissions](#scope--permissions)
- [Not yet supported](#not-yet-supported)
- [See also](#see-also)

---

## Open the Explorer

In the **Workspaces** sidebar, expand a workspace tile, then click the **Explorer** row. It sits between **Dashboard** and **SupaTTY** in the sub-app list, with a folder-tree icon.

The Explorer always opens at the workspace **root** (the workspace's `rootPath`). The header reads `Explorer · Miller columns`.

> **Note** — clicking the workspace tile's _name_ opens the **Dashboard**, not the Explorer. Use the dedicated **Explorer** row.

---

## Navigate columns

Each column is one directory level. The view is **lazy**: a folder is listed only when you open it, one level at a time.

- Click a **folder** → its contents open in a new column to the right.
- Click a **file** → its metadata (name, type, size, git status) appears in the rightmost panel; any deeper columns collapse.
- Re-clicking a folder in a column to the left **truncates** every column to its right and re-branches from there.

The row of columns scrolls horizontally; each column scrolls vertically.

### Mouse

| Action                | Result                                              |
| --------------------- | --------------------------------------------------- |
| Single-click a row    | Select it (file → show details; folder → highlight) |
| Double-click a folder | Descend into it (opens its column)                  |
| Double-click a file   | Open it in the OS default app                       |
| Right-click a row     | Open the context menu (see below)                   |

### Keyboard

Focus a row first (click it once), then:

| Key            | Action                                                                             |
| -------------- | ---------------------------------------------------------------------------------- |
| `↓` / `↑`      | Move the cursor down / up within the current column                                |
| `→`            | Descend into the selected **folder** (no-op on a file)                             |
| `←`            | Return to the parent column (focuses the row that owns the current column)         |
| `Enter`        | Open the selected **file** in the OS default app; on a **folder**, descend into it |
| `Home` / `End` | Jump to the first / last row of the current column                                 |

---

## Read git status colors

Inside a git repository, each entry carries its git status as **both** a color and a single-letter glyph on the right of the row — so status is never conveyed by color alone. Colors are theme tokens (`--ansi-*`), so they re-theme when you change the palette.

| Glyph | Color      | Status       | Meaning                                                 |
| ----- | ---------- | ------------ | ------------------------------------------------------- |
| `M`   | Yellow     | `modified`   | Tracked file changed since the last commit              |
| `A`   | Green      | `added`      | Staged new file                                         |
| `U`   | Green      | `untracked`  | New file git is not yet tracking                        |
| `D`   | Red        | `deleted`    | File removed                                            |
| `C`   | Red        | `conflicted` | Unmerged / merge-conflict file                          |
| `R`   | Blue       | `renamed`    | File renamed (or copied)                                |
| `I`   | Muted gray | `ignored`    | Matched by `.gitignore` (rarely shown — see trap below) |

A row with **no glyph** is clean (or you are outside a git repo, where decorations are simply absent).

The selected file's metadata panel also shows the status spelled out (`modified`, `untracked`, …, or `clean`).

> **Trap — folders bubble up dirt.** A folder's status reflects its _dirtiest descendant_: if `src/a/b.ts` is modified, the `src/a` folder row shows `M`. The folder itself is not changed — one of its children is. This lets you spot which branches of the tree hold edits without expanding them.

---

## Use the context menu

Right-click any row to open its action menu. The available items depend on whether the row is a file or a folder.

| Row type   | Menu items                           |
| ---------- | ------------------------------------ |
| **File**   | **Open**, **Reveal in file manager** |
| **Folder** | **Reveal in file manager**           |

What each item does:

- **Open** — hands the file to the **OS default application** for its type (the system file-association handler). Same as double-clicking the file.
- **Reveal in file manager** — opens the **OS file manager** with the entry selected: Windows Explorer on Windows, Finder on macOS, the default file manager on Linux.

The menu is keyboard-navigable: `↑` / `↓` to move, `Enter` or `Space` to activate, `Esc` (or an outside click) to dismiss.

---

## Scope & permissions

Listing is **scoped to the workspace `rootPath`**. Everything inside that folder lists freely; anything outside it — including symlinks that resolve out of scope — is blocked.

When you reach an out-of-scope folder, an in-app banner appears at the top of the Explorer:

```
This folder is outside the workspace scope
<absolute path>

  [ Grant access ]   [ Dismiss ]
```

- **Grant access** — routes through the `PathGrant` flow (`window.ws.permissions.requestPath`, requested as a **read** grant). On approval, the blocked folder is listed in place.
- **Dismiss** — closes the banner without requesting access.

Two cases trigger this banner:

1. **The Home workspace** — it has no `rootPath`, so even its root needs a grant before anything lists.
2. **Any out-of-scope path** reached through a granted parent (e.g. a symlink pointing outside the workspace).

For the full grant / pre-grant / revoke workflow, see [grant-out-of-scope-path.md](./grant-out-of-scope-path.md).

---

## Not yet supported

This is the **v1** Explorer. The following are deliberately out of scope and planned for **v2**:

- **No file preview** — selecting a file shows its metadata only (name, type, size, git status), not its contents.
- **No syntax highlighting** and **no Markdown rendering**.
- **Single-level lazy listing** — directories are listed one level at a time on demand; there is no recursive / tree-expand view, and no search across the tree.

Two more behaviors worth knowing:

- **Gitignored entries are hidden.** Files and folders matched by `.gitignore` (e.g. `node_modules`, `dist`) do not appear in the listing at all. That is why the `ignored` (`I`) decoration is rarely seen — ignored entries are filtered out before they reach the column.
- **Very large directories are truncated.** A column lists at most 5000 entries; beyond that the listing stops to keep the UI responsive.

---

## See also

- [grant-out-of-scope-path.md](./grant-out-of-scope-path.md) — approve, pre-grant, or revoke out-of-scope filesystem access.
- [manage-workspaces.md](./manage-workspaces.md) — create, rename, recolor, and delete the workspaces the Explorer browses.
- [../architecture/sub-apps.md](../architecture/sub-apps.md) — how sub-apps slot into the workspace sidebar tree.
