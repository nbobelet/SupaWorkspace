---
type: how-to
updated: 2026-05-20
---

# Use the Kanban board

The **Todo** sub-app (`supatty` → `notes` → `todo` in the sidebar) provides a per-workspace Kanban board. Each workspace has its own isolated task list. The Home workspace shows a merged view of tasks from all workspaces.

## Contents

- [Create a task](#create-a-task)
- [Move a task across columns](#move-a-task-across-columns)
- [Archive a task](#archive-a-task)
- [Manage columns](#manage-columns)
- [Home aggregated view](#home-aggregated-view)
- [IPC channels reference](#ipc-channels-reference)

---

## Create a task

1. Open the workspace whose board you want to add to.
2. Click the **Todo** sub-app in the sidebar.
3. Click the **+** button in the header (or the column header if you want to place the task in a specific column).
4. Fill in the task title (required, 1–200 characters). Optionally add a description (up to 10 000 characters), a severity (`low` | `medium` | `high`), a deadline, and a kind (`todo` | `fix`).
5. Confirm. The task appears in the target column.

Internally, the renderer calls `todo:create-task` with a `TodoCreateTaskRequest` (`workspaceId` + a full `Task` object including a client-generated UUID).

---

## Move a task across columns

Drag a task card and drop it on the target column header or between existing cards in that column. The board calls `todo:reorder` with:

- `workspaceId`
- `taskId`
- `toColumnId` — the destination column's `ColumnId` (a lowercase ASCII slug, e.g. `running`, `done`)
- `toIndex` — zero-based position inside the destination column

The `columnOrder` map in `TodoState` is the single source of truth for display order. The main-side handler updates it atomically.

---

## Archive a task

Drag the task to the **Archive** column, or open the task drawer and click **Archive**.

The `archive` column is a built-in (`builtin: true`) with a fixed id of `archive`. It cannot be renamed or deleted. Deleting a column that still contains tasks automatically moves those tasks to `archive`.

---

## Manage columns

Open the **Settings** tab inside the Todo sub-app (gear icon in the header).

- **Add a column** — enter a name, pick a hex color, click **Add**.
- **Rename a column** — built-in columns (`builtin: true`) cannot be renamed or deleted. Custom columns can be renamed in place.
- **Delete a column** — tasks in the deleted column are moved to `archive` before the column is removed.
- **Reorder columns** — drag handles in the Settings tab control display order.

On save the renderer calls `todo:set-columns` with the full updated `Column[]` array. A column's `id` is its stable slug (set at creation, never changes) — it is used as the droppable id and as a CSS token suffix (`--color-state-<id>`).

---

## Home aggregated view

When the **Home** workspace (`kind: 'home'`) is open and the Todo sub-app is active, the board shows a merged view of tasks from all workspaces.

How it works:

- Tasks live in their own workspace's store — no data is copied or duplicated.
- The merge uses Home's column set as the canonical column list. Tasks whose `columnId` does not exist in Home's columns are appended to a best-effort fallback column.
- Every mutation (move, edit, delete) is routed back to the owning workspace via an internal `originOf` map (`taskId → workspaceId`). The `todo:*` IPC calls that result carry the **source workspace id**, not Home's id.

This means edits made from the Home view are indistinguishable from edits made directly in each workspace's board.

---

## IPC channels reference

All channel names are defined in `IpcChannel` in `packages/shared/src/ipc.ts`. The corresponding Zod schemas and inferred TypeScript types live in the same file.

| Channel constant            | Wire name          | Direction       | Purpose                                                  |
| --------------------------- | ------------------ | --------------- | -------------------------------------------------------- |
| `IpcChannel.TodoGet`        | `todo:get`         | invoke → handle | Fetch the full `TodoState` for a workspace               |
| `IpcChannel.TodoCreateTask` | `todo:create-task` | invoke → handle | Add a new `Task` to a workspace board                    |
| `IpcChannel.TodoUpdateTask` | `todo:update-task` | invoke → handle | Replace an existing `Task` in full                       |
| `IpcChannel.TodoDeleteTask` | `todo:delete-task` | invoke → handle | Remove a task by `taskId`                                |
| `IpcChannel.TodoReorder`    | `todo:reorder`     | invoke → handle | Move a task to a new column and/or position              |
| `IpcChannel.TodoSetColumns` | `todo:set-columns` | invoke → handle | Replace the full column list (add/rename/delete/reorder) |

`todo:get` returns `TodoGetResponse` which includes a `fallbackUsed: boolean` flag. Today this is always `false` (the store writes to `userData` unconditionally). The flag is on the wire shape so the renderer can surface a warning toast if a future version falls back to an alternate persistence path without a wire-format migration.

---

## See also

- `packages/shared/src/todo.ts` — `Task`, `Column`, `TodoState`, `DEFAULT_COLUMNS`, `ARCHIVE_COLUMN_ID`.
- `packages/shared/src/ipc.ts` — full request/response schemas for every `todo:*` channel.
- `apps/renderer/src/sub-apps/todo/` — renderer components (`KanbanBoard`, `TaskCard`, `ColumnEditor`, …).
- `apps/renderer/src/sub-apps/todo/aggregate.ts` — `mergeTodoStates` for the Home aggregated view.
- [architecture/sub-apps.md](../architecture/sub-apps.md) — how sub-apps slot into the workspace sidebar tree.
