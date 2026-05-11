# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) + [Conventional Commits](https://www.conventionalcommits.org/).

## [Unreleased]

### Added

- feat(renderer): per-workspace tab scoping — tabs only show sessions belonging to the active workspace.
- feat(renderer): inline tab rename via double-click (mirrors workspace rename UX, `$mod+R` shortcut, persisted main-side).
- feat(renderer): notification center — bell button per workspace tile with unread badge, popover with recent notifications, click to jump to session.
- feat(renderer): in-app toasts via `sonner` (top-right, max 3 stacked, auto-dismiss 4s, respects `prefers-reduced-motion`).
- feat(renderer): keyboard shortcuts layer via `tinykeys` — `$mod+K` palette, `$mod+T/W/Tab/1-9/Shift+[]`, `$mod+R` rename tab, `F2` rename workspace.
- feat(renderer): command palette (`$mod+K`) — fuzzy search over workspaces, sessions in the current workspace, and quick actions.
- feat(main): `session:rename` IPC channel with Zod-validated payload; in-memory persistence so labels survive workspace switches.
- feat(main): `notif:push` IPC channel — emitted on every state transition (waiting / finished / error), independent of window focus.

### Changed

- refactor(renderer): `App.tsx` keydown handler replaced with centralized `useKeybindings` hook; legacy `Ctrl+Shift+T` consolidated to `Ctrl+T`.

### Docs

- docs(readme): new "Features" and "Keyboard shortcuts" sections.
- docs: new `docs/keyboard-shortcuts.md` reference page.
