---
type: how-to
updated: 2026-05-27
---

# Launch a WSL: Ubuntu shell

SupaTerminal can open a session inside a Windows Subsystem for Linux distro, alongside the regular shell and Claude sessions.

## Prerequisites

- Windows with **WSL 2** enabled.
- An **Ubuntu** distro installed (`wsl --install -d Ubuntu` from any Windows shell).

When `wsl.exe` is not on `PATH` — every non-Windows host, or a Windows host without WSL — the WSL launch entry is hidden. Nothing to disable; it simply does not appear.

## Open a session

Three entry points, all equivalent:

- **Tab bar** — click the `WSL` button next to `Shell` and `Claude`.
- **Empty workspace** — click `WSL: Ubuntu`.
- **Command palette** (`Ctrl+K`) — run `+ New WSL: Ubuntu session`.

The session starts in the workspace root (`rootPath`), translated to its WSL mount via `wsl --cd`.

## Scope boundary — read this

A workspace's `rootPath` is the scope boundary for Windows-side file access (see [grant-out-of-scope-path](grant-out-of-scope-path.md)). **That boundary does not cross into WSL.**

Once you are inside the WSL shell you can `cd /home`, reach the full Linux userland, or browse `\\wsl$\…` — none of it is constrained by the workspace scope. The `--cd` launch directory is the only point where scope applies. Treat `\\wsl$\…` paths as out-of-scope: SupaTerminal's file/explorer features do not reach into the distro.

This is the deliberate trade-off of the single hardcoded Ubuntu profile. Per-distro selection and in-WSL scope enforcement are out of scope for this version.
