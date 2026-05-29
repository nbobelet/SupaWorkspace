# Changelog

All notable changes to this project are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Commits and entries follow [Conventional Commits](https://www.conventionalcommits.org/) (Angular). See [docs/CONVENTIONS.md](docs/CONVENTIONS.md#commits--conventional-commits-angular) for the full prefix list, scope rules, and the opt-in Husky hook.

## [Unreleased]

### Removed

- feat(todo): remove the Todo list / Kanban board sub-app entirely — renderer sub-app, main `TodoStore` + `todo:*` IPC, shared `SubAppId 'todo'` + `@shared/todo` contract, and the dashboard todo aggregation. The dashboard now derives purely from the session store.

### Docs

- docs: project doc bootstrap — `docs/AUDIT-2026-05-19.md` (audit snapshot), `docs/index.md` (Diátaxis MOC, canonical entry point), `docs/CONVENTIONS.md` (naming, frontmatter, commits, link discipline), `docs/HEALTH.md` (auto-generated freshness telemetry, 60-day observation window before formal policy).
- docs: restructure — `git mv docs/how-to-manage-workspaces.md docs/how-to/manage-workspaces.md` (naming convention now consistent across how-to pages), README architecture sections slimmed to one-liners that link into `docs/architecture/*.md`, shortcut table now lists `$mod + \` (cycle layout).
- docs: project `CLAUDE.md` rewritten with stable sections (commands, architecture, conventions, known-limitations). Preserves the 2026-05-19 worktree-base-bug note verbatim.
- chore: archive `bug-reports/` → `archive/bug-reports/` (`git mv`, history preserved); `archive/README.md` documents the archival convention.

### Added

- build(scripts): `scripts/docs-health.ts` + `pnpm docs:health` script. Reports `apps/*` vs `docs/*` commit ratio over the last 7 days, broken-link count, and per-page freshness (frontmatter `updated:` vs git last-commit date). Pure git + filesystem, no external services.
- build(deps): `tsx` dev-dep for running TS scripts under `pnpm`.
- chore: `@commitlint/cli` + `@commitlint/config-conventional` dev-deps; `commitlint.config.js` at repo root. Conventional-Commits enforcement is **opt-in** — `pnpm commitlint` available, Husky hook described in `docs/CONVENTIONS.md` but not auto-installed.

### Fixed

- docs(readme): `pnpm typecheck` description corrected from `tsc -b --noEmit across the monorepo` to `tsc -p tsconfig.json` (matches actual `package.json#scripts.typecheck`).

## [0.2.0] - 2026-05-12

### Fixed

- fix(renderer): right-click context menu (`TabContextMenu`, workspace sidebar) now opens at the cursor and stays inside the viewport — dropped the HTML Popover API in favor of a measured `position: fixed` + `clampMenuPosition` pure helper. Both menus close on Escape, outside pointerdown, scroll, and window blur.
- fix(renderer): tab drag-and-drop reorder restored. The inner activate/close buttons were calling `e.stopPropagation()` on `pointerdown`, which kept `@dnd-kit`'s `PointerSensor` from ever receiving the event — `activationConstraint: { distance: 4 }` already disambiguates click vs. drag, so the guards were dead weight that broke dragging. Drag is now `disabled` only while a tab is being renamed inline.
- fix(renderer): xterm always follows new output. `term.write()` now schedules a `scrollToBottom()` callback so live PTY output stays in view; user scroll-up is overridden on the next chunk, matching the default terminal-app expectation.
- fix(renderer): closing a session no longer hops `activeId` to another workspace. `removeSession` now picks the same-workspace sibling first; only falls back to the global last-order entry when the killed session had no siblings (in which case the workspace entry is dropped and `PaneMosaic` renders `EmptyWorkspaceState`). Exit handler wrapped in `withViewTransition` for a smooth cross-fade.

### Added

- feat(renderer): spawn-focus invariant — every user-initiated `Session` spawn (Ctrl+T, palette, "+" buttons, `WelcomePane`, `EmptyWorkspaceState`, `duplicate`) goes through `addSessionWithFocus()`, which atomically adds the Session, makes it the active tab for its workspace, focuses xterm, and scrolls the new tab into view. Snapshot restore on boot keeps using `addSession` directly so it does not steal focus during replay.
- docs: new `docs/concepts.md` (Diátaxis explanation) pinning the canonical vocabulary `Workspace ⊃ Session ⊃ Type{claude|shell|terminal}`. Linked from README `## Features` lead and from `docs/keyboard-shortcuts.md`.
- test: 6 unit tests for `clampMenuPosition` covering center / right-edge / bottom-edge / corner / negative-cursor / overflowing-menu cases.
- test: 2 unit tests for `removeSession` covering same-workspace fallback preference and cross-workspace isolation on last-session removal.
- feat(renderer): keybindings Ctrl+I (focus command input bar, auto-shows it if hidden) and Ctrl+, (toggle global Settings panel). Settings toggle button moved from `WorkspaceSidebar` bottom to the header next to `LayoutSwitcher` (right-aligned, lucide `Settings` icon + label).
- feat(main): BrowserWindow title now `SupaWorkspace - DEV` in development and `SupaWorkspace - PROD` when packaged (`app.isPackaged`). Renderer-side `<title>` updates blocked so the window title stays stable.
- feat(main): shared versioned `userData` path — `<appData>/SupaWorkspace/v1/` — so dev (`pnpm dev`) and packaged builds read/write the **same** `electron-store` files (workspaces, notes, input-history, sessions-snapshot, cmd-guard). Bump `SHARED_DATA_VERSION` in `apps/main/src/index.ts` on non-backward-compatible schema changes to keep old data as rollback. Do **not** run dev and packaged builds simultaneously (electron-store lock).
- feat(shared): `NotificationKind` 4-value Zod enum (`request-complete` / `user-input-required` / `permission-prompt` / `error`); `notif:push` payload `sessionId` + `sessionLabel` now optional (permission-prompt has no session).
- feat(shared): `Workspace.color = { hue }` optional field. New IPC channels: `workspace:set-color`, `permissions:grant-conflicts`, `notes:get`, `notes:set`.
- feat(main): deterministic `detectUserInputRequired(buffer)` pure function — replaces 800ms idle timeout with end-of-buffer prompt sentinels (`[y/N]`, `[Y/n]`, `Press any key`, `Do you want to allow…`, sudo, OSC 133). 11 unit tests.
- feat(main): `Notifier.emitPermissionPrompt` — fires `permission-prompt` notif before showing the out-of-scope access dialog.
- feat(main): `pickWorkspaceHue(existingHues)` — picks from a curated 8-hue OKLCH palette `[15, 45, 95, 145, 195, 230, 270, 310]` and maximizes the minimum angular distance to existing hues. 9 unit tests including 360° wrap-around.
- feat(main): `WorkspaceStore.setColor(id, hue)`, `WorkspaceStore.findGrantConflicts()` (paths granted in 2+ workspaces).
- feat(main): `SessionManager.killAllInWorkspace(workspaceId)` + delete cascade in `workspace:remove` handler.
- feat(main): `NotesStore` (separate `electron-store` instance, key `userNotes`) + `notes:get` / `notes:set` IPC handlers (Zod max 1MB).
- feat(renderer): `useInlineRename(onCommit)` hook — single source of truth for the dbl-click → Enter/Esc/blur rename pattern; applied to both `WorkspaceSidebar` and `SessionTabs`.
- feat(renderer): workspace settings menu — Lucide `Settings` icon on tile hover opens a popover with **Rename / Change color (8-swatch OKLCH palette) / Delete (sonner destructive confirm)**.
- feat(renderer): workspace color pill on tile + terminal left border via `--ws-hue` CSS variable (scoped to the active pane wrapper, not global). Fallback to existing `accent` token when no color set.
- feat(renderer): `EmptyWorkspaceState` component — replaces blank pane when the active workspace has no sessions; primary CTA **New Shell** (Lucide `Terminal`), secondary **New Claude** (Lucide `Sparkles`).
- feat(renderer): tabs bar visual dissociation — action buttons separated from the tab list by a left border, larger touch target (h-7), Lucide-iconned with labels; workspace `rootPath` displayed right-aligned (truncated middle, full path on hover via `title`).
- feat(renderer): `notificationStore.clearForWorkspace(id)` — deletes notifications for a workspace; wired into workspace tile click so notifications are dismissed on activation.
- feat(renderer): markdown notes panel — 4th tab in `SettingsPanel`, CodeMirror + `@codemirror/lang-markdown` editor. Notes persist across workspace switches via `electron-store` key `userNotes`; debounced save 500ms.
- feat(renderer): workspace conflict UX — sonner info toast "Already open as `<name>`" when re-opening an existing folder (scenario a); cross-workspace `PathGrant` conflicts surfaced as a warn banner in Settings → Permissions (scenario c).
- test: 11 unit tests for `detectUserInputRequired`, 9 for `pickWorkspaceHue`, 1 for `notificationStore.clearForWorkspace`, 3 for `notesStore` (load-once / cross-workspace persistence / flush).
- test: new Playwright smoke `e2e/delete-workspace.spec.ts` — seed → spawn shell → IPC remove → assert tile gone.

### Changed

- refactor(main): `WorkspaceStore.openOrCreate` returns `{ workspace, wasExisting }` (was `Workspace`). `WorkspaceOpenResponse` schema extended with optional `wasExisting` flag.
- refactor(main): `StateDetector` drops the 800ms idle timeout for waiting-for-input transitions — detection is now deterministic on every buffer change.
- refactor(renderer): notification toasts switch on the new kind values; `markAllReadForWorkspace` (existing) preserved alongside new `clearForWorkspace`.
- refactor(renderer): `+ shell` / `+ claude` text buttons replaced with Lucide-iconned **Shell** / **Claude** buttons; aria-labels are now `New shell session` / `New Claude session`.

### Docs

- docs(readme): new "Notifications" section documenting the 4 `NotificationKind` values; "Features" section expanded with workspace color/settings/delete/notes.
- docs: new `docs/how-to-manage-workspaces.md` (Diátaxis how-to) covering create / rename / color / delete / conflict handling.
