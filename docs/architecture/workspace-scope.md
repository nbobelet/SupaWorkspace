---
type: explanation
updated: 2026-05-20
---

# Workspace kinds, scope, and cwd resolution

This page explains what a Workspace is at the data level, how the two workspace kinds differ in their security scope, and how the PTY spawn directory is resolved independently of that scope.

## Contents

- [Two workspace kinds](#two-workspace-kinds)
- [The scope boundary](#the-scope-boundary)
- [workdir is not scope](#workdir-is-not-scope)
- [getEffectiveCwd — the fallback chain](#geteffectivecwd--the-fallback-chain)
- [PermissionGate.check — how scope is enforced](#permissiongatecheck--how-scope-is-enforced)
- [See also](#see-also)

---

## Two workspace kinds

`WorkspaceKind` (`packages/shared/src/workspace.ts`) is a Zod enum with exactly two values:

```ts
export const WorkspaceKind = z.enum(['folder', 'home'])
```

| Kind     | `rootPath`                                      | Scope                                 | Deletable                |
| -------- | ----------------------------------------------- | ------------------------------------- | ------------------------ |
| `folder` | Non-null string — the directory the user opened | `rootPath` + `permissions.extraPaths` | Yes                      |
| `home`   | `null` — no implicit directory scope            | `permissions.extraPaths` only         | No — permanent singleton |

The `home` workspace is the always-present default. It has a deterministic id (`HOME_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001'`) and a fixed name (`HOME_WORKSPACE_NAME = 'Home'`). The helper `isHomeWorkspace(ws)` checks `ws.kind === 'home'`.

The inline documentation on `WorkspaceKind` states the design intent directly:

> `home` is the single permanent default workspace — `rootPath: null` (no implicit scope, every out-of-scope access must go through a PathGrant).

---

## The scope boundary

For `folder` workspaces the scope boundary is `rootPath`. For `home` workspaces there is no implicit boundary.

In both cases, any path outside the boundary can be accessed only through an explicit `PathGrant` stored in `permissions.extraPaths`. A `PathGrant` carries a `path`, a `kind` (`read` | `write`), and a `grantedAt` timestamp. Granting a path is the `permissions:request-path` IPC flow (see `docs/how-to/grant-out-of-scope-path.md`).

```
scope = rootPath (folder only) ∪ permissions.extraPaths
```

`workdir` is **not** part of the scope. See the next section.

---

## workdir is not scope

`Workspace.workdir` (`z.string().nullable().default(null)`) is a cwd hint — it records where the user wants terminals to open. It does **not** widen the security scope in any way.

The design intent is stated in the field-level JSDoc on `WorkspaceKind`:

> `workdir` is a cwd hint only (where terminals spawn) and grants NO permission; it diverges from `rootPath` solely on `home`. Both fields are nullable and kept distinct on purpose.

Concretely: a `home` workspace with `workdir: '/Users/alice/projects/foo'` still has no implicit read or write access to `/Users/alice/projects/foo` unless a `PathGrant` for that path exists in `permissions.extraPaths`. The `PermissionGate` never reads `workdir`.

`workdir` is user-configurable via the `workspace:set-workdir` IPC channel (`WorkspaceSetWorkdirRequest`).

---

## getEffectiveCwd — the fallback chain

`getEffectiveCwd` (`apps/main/src/workspace/getEffectiveCwd.ts`) is the single source of truth for where a PTY spawns. It is called by the session manager and never by the renderer:

```ts
export function getEffectiveCwd(ws: Pick<Workspace, 'rootPath' | 'workdir'>): string {
  return usableDir(ws.rootPath) ?? usableDir(ws.workdir) ?? homedir()
}
```

`usableDir` returns the path only if it exists and `statSync` confirms it is a directory; otherwise `null`.

The fallback chain in order:

1. `rootPath` — wins if set and the directory exists (`folder` workspaces always land here unless the directory was deleted).
2. `workdir` — wins if `rootPath` is null or unusable and `workdir` exists as a directory (`home` workspaces with a set cwd hint land here).
3. `homedir()` — the OS user's home directory, used when neither field yields a usable path.

The source comment makes the scope relationship explicit:

> The fallback is NOT a scope grant — scope lives only in `rootPath` + `permissions.extraPaths` (see PermissionGate), so spawning in homedir gives Home a place to start without widening its permission boundary.

---

## PermissionGate.check — how scope is enforced

`PermissionGate.check` (`apps/main/src/security/PermissionGate.ts`) is the runtime enforcement point. Every main-side file-access path that respects scope calls this method before proceeding:

```ts
static check(workspace: Workspace, absolutePath: string, kind: 'read' | 'write' = 'read'): boolean {
  const target = resolve(absolutePath)
  // A null rootPath (Home) carries no implicit scope: every path must be
  // earned through an explicit PathGrant in `permissions.extraPaths`.
  if (workspace.rootPath !== null && this.isInside(workspace.rootPath, target)) return true
  return workspace.permissions.extraPaths.some((grant) => {
    if (!this.isInside(grant.path, target)) return false
    if (grant.kind === 'write') return true
    return kind === 'read'
  })
}
```

For a `home` workspace (`rootPath === null`) the first branch is never taken. Every path must pass the `extraPaths` check. A `write` grant covers both reads and writes to that path; a `read` grant covers reads only.

`isInside` uses `path.resolve` + `path.sep` so path comparisons are always case-normalised and separator-correct across platforms.

---

## See also

- `packages/shared/src/workspace.ts` — `Workspace`, `WorkspaceKind`, `PathGrant`, `HOME_WORKSPACE_ID`, `HOME_WORKSPACE_NAME`, `isHomeWorkspace`.
- `apps/main/src/workspace/getEffectiveCwd.ts` — PTY cwd resolution.
- `apps/main/src/security/PermissionGate.ts` — scope enforcement.
- [concepts.md](../concepts.md) — canonical vocabulary overview.
- [how-to/grant-out-of-scope-path.md](../how-to/grant-out-of-scope-path.md) — granting and revoking `PathGrant` entries.
