---
type: how-to
updated: 2026-05-12
---

# Configure `.claude/settings.json` for a workspace

Each workspace has its own `.claude/settings.json` file at `<rootPath>/.claude/settings.json`. This is the file the `claude` CLI reads at startup — it controls per-tool permissions, MCP servers, hooks, and any other Claude Code setting that lives at the project scope.

SupaTerminal does **not** enforce anything from this file at runtime — the `claude` CLI itself enforces it at tool-call time. SupaTerminal only edits the file on your behalf and persists it on disk.

This page walks through the two ways to edit it.

## Through the Settings panel (recommended)

1. Make the workspace active (click its tile in the sidebar).
2. Open **Settings** (gear icon in the workspace tile, or the Settings entry in the command palette).
3. Pick the **MCP servers** tab to add or remove servers, or **Permissions** to manage `allow` / `deny` patterns for Claude's tools.
4. Changes are written back to `<rootPath>/.claude/settings.json` via the `workspace:write-settings` IPC channel as soon as you commit them.

The panel parses the existing file with the `ClaudeSettingsSchema` (Zod, see `packages/shared/src/ipc.ts`) and surfaces a structured editor — you cannot accidentally write malformed JSON from the panel.

> The schema is `passthrough` — unknown keys you have already added to the file by hand (for example custom hooks) are preserved on write. The panel only manages the keys it knows about.

## By hand (when you need a key the panel does not expose)

1. Open `<rootPath>/.claude/settings.json` in any editor (`code .claude/settings.json` from the workspace shell tab works).
2. Edit the JSON. The minimum shape is:

   ```json
   {
     "permissions": {
       "allow": ["Read(./**)", "Bash(pnpm:*)"],
       "deny": []
     },
     "mcpServers": {}
   }
   ```

3. Save. The `claude` CLI re-reads `.claude/settings.json` at the start of each request — restart the Claude session (`Ctrl+W` to close, `Ctrl+T` to spawn a new one) to be sure.

## Common patterns

### Allow a specific package manager

```json
{
  "permissions": {
    "allow": ["Bash(pnpm:*)", "Bash(npx:*)"]
  }
}
```

### Pre-approve reads inside the workspace

```json
{
  "permissions": {
    "allow": ["Read(./**)"]
  }
}
```

Already implicit if the path is inside `rootPath` — but this skips the `claude` CLI's own per-tool prompt for `Read` calls.

### Deny a destructive command

```json
{
  "permissions": {
    "deny": ["Bash(rm:*)", "Bash(git push:*)"]
  }
}
```

`deny` wins over `allow`. If a pattern matches both, the tool call is refused.

## Where the file lives vs. who enforces what

| Layer                                  | Reads | Enforces                                |
| -------------------------------------- | ----- | --------------------------------------- |
| `<rootPath>/.claude/settings.json`     | `claude` CLI | Per-tool permissions (`Bash`, `Read`, …) |
| `Workspace.permissions.extraPaths` (in-app) | SupaTerminal main process | Out-of-scope **filesystem** access (`PathGrant`) |

The two are independent. SupaTerminal's `PathGrant` system gates *which paths the `claude` process can touch on disk*; the `.claude/settings.json` `allow` / `deny` gates *which tools the model is allowed to invoke*. You need both correct for the workflow you want.

For granting out-of-scope filesystem paths, see [grant-out-of-scope-path.md](./grant-out-of-scope-path.md).

## When changes do not seem to take effect

- The `claude` CLI caches the settings for the current request. If you edit during a running request, the change applies on the **next** request.
- If you edited by hand and the file is malformed JSON, the CLI falls back silently to default permissions. Open the file in an editor with JSON validation, or run `pnpm exec jsonlint .claude/settings.json` from the workspace shell.
- If the Settings panel shows different content from what you typed by hand, the panel re-read the file after your last edit was saved. Refresh the panel by switching tabs and back.
