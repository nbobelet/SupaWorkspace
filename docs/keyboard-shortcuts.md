---
type: reference
updated: 2026-05-11
---

# Keyboard shortcuts

`$mod` = **Cmd** on macOS, **Ctrl** on Windows / Linux. Shortcuts are scoped to the active workspace and no-op while focus is in a text input or inside a terminal pane.

| Key                         | Action                                | Scope            |
| --------------------------- | ------------------------------------- | ---------------- |
| `$mod + K`                  | Open command palette                  | App              |
| `$mod + T`                  | Spawn new session (last-used type)    | Active workspace |
| `$mod + W`                  | Close active session                  | Active session   |
| `$mod + Tab`                | Cycle to next session                 | Active workspace |
| `$mod + Shift + Tab`        | Cycle to previous session             | Active workspace |
| `$mod + 1` … `$mod + 9`     | Jump to session N                     | Active workspace |
| `$mod + Shift + ]`          | Switch to next workspace              | App              |
| `$mod + Shift + [`          | Switch to previous workspace          | App              |
| `$mod + R`                  | Rename active tab (inline)            | Active session   |
| `F2`                        | Rename active workspace (inline)      | Active workspace |
| `$mod + \`                  | Cycle layout (single / grid / split)  | App              |

## Notes

- Tabs only show sessions belonging to the active workspace — `$mod + Tab` and `$mod + 1`…`9` therefore stay inside that workspace.
- The command palette (`$mod + K`) fuzzy-searches across workspaces, sessions in the current workspace, and quick actions (new shell / new Claude / rename / close).
- Double-click any tab to rename inline. Right-click any workspace tile for the rename / reveal / remove context menu.
