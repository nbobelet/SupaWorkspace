import { resolve, join, sep } from 'node:path'
import { describe, it, expect } from 'vitest'
import { PermissionGate } from './PermissionGate'
import type { Workspace } from '@shared/workspace'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Builds the minimal Workspace shape PermissionGate.check() needs. */
function makeWorkspace(
  rootPath: string | null,
  extraPaths: Array<{ path: string; kind: 'read' | 'write' }> = [],
): Workspace {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    name: 'test-ws',
    kind: rootPath === null ? 'home' : 'folder',
    rootPath,
    workdir: null,
    createdAt: 0,
    lastOpenedAt: 0,
    deletedAt: null,
    permissions: {
      extraPaths: extraPaths.map((g) => ({ ...g, grantedAt: 0 })),
      allow: [],
      deny: [],
    },
  }
}

/**
 * A stable absolute root for cross-platform tests.
 * Using process.cwd() guarantees a real OS-rooted path on both Windows and
 * POSIX without hard-coding drive letters or slashes.
 */
const ROOT = join(resolve(process.cwd()), 'test-root')
const INSIDE = join(ROOT, 'subdir', 'file.ts')
const SIBLING_PREFIX = ROOT + 'extra' // e.g. /some/path/test-rootextra — same prefix, different node
const OUTSIDE = join(resolve(process.cwd()), 'other-dir', 'file.ts')

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('PermissionGate.check()', () => {
  // 1. Folder workspace — target strictly inside rootPath
  it('allows a path strictly inside rootPath for a folder workspace', () => {
    const ws = makeWorkspace(ROOT)
    expect(PermissionGate.check(ws, INSIDE)).toBe(true)
  })

  // 2. Folder workspace — target outside rootPath, no grant
  it('denies a path outside rootPath when there is no matching grant', () => {
    const ws = makeWorkspace(ROOT)
    expect(PermissionGate.check(ws, OUTSIDE)).toBe(false)
  })

  // 3. Home workspace (rootPath: null) — matching grant in extraPaths → allowed
  it('allows a path covered by an extraPaths grant on the Home workspace (read)', () => {
    const grantedDir = join(resolve(process.cwd()), 'granted')
    const targetInGrant = join(grantedDir, 'file.ts')
    const ws = makeWorkspace(null, [{ path: grantedDir, kind: 'read' }])
    expect(PermissionGate.check(ws, targetInGrant, 'read')).toBe(true)
  })

  // 4. Home workspace (rootPath: null) — no grant → denied (no implicit scope)
  it('denies a path on the Home workspace when no grant covers it', () => {
    const ws = makeWorkspace(null)
    expect(PermissionGate.check(ws, INSIDE)).toBe(false)
  })

  // 5. Traversal: constructed path that would escape rootPath via ".."
  it('denies a traversal path that resolves outside rootPath', () => {
    // resolve() is called inside check() — the traversal collapses before comparison.
    // Building the traversal from INSIDE: go deep then back up past ROOT.
    const traversal = join(ROOT, 'subdir', '..', '..', 'outside-file.ts')
    const ws = makeWorkspace(ROOT)
    expect(PermissionGate.check(ws, traversal)).toBe(false)
  })

  // 6. Prefix-confusion: rootPath = ROOT, target = ROOT + "extra" (no sep boundary)
  it('denies a sibling path that shares a string prefix with rootPath but is not a child', () => {
    const ws = makeWorkspace(ROOT)
    // SIBLING_PREFIX resolves to ROOT + 'extra' which starts with ROOT's chars
    // but does NOT start with ROOT + sep → must be denied.
    expect(PermissionGate.check(ws, SIBLING_PREFIX)).toBe(false)
  })

  // 7. Exact-boundary: target === rootPath → allowed (isInside returns true on exact match)
  it('allows the exact rootPath itself (boundary inclusive)', () => {
    const ws = makeWorkspace(ROOT)
    expect(PermissionGate.check(ws, ROOT)).toBe(true)
  })

  // --- Additional grant-kind cases ---

  // 8. Write grant covers both read and write requests
  it('allows a read request when the matching grant kind is "write"', () => {
    const grantedDir = join(resolve(process.cwd()), 'write-granted')
    const target = join(grantedDir, 'file.ts')
    const ws = makeWorkspace(null, [{ path: grantedDir, kind: 'write' }])
    expect(PermissionGate.check(ws, target, 'read')).toBe(true)
    expect(PermissionGate.check(ws, target, 'write')).toBe(true)
  })

  // 9. Read-only grant denies a write request
  it('denies a write request when the matching grant kind is "read"', () => {
    const grantedDir = join(resolve(process.cwd()), 'read-only-granted')
    const target = join(grantedDir, 'file.ts')
    const ws = makeWorkspace(null, [{ path: grantedDir, kind: 'read' }])
    expect(PermissionGate.check(ws, target, 'write')).toBe(false)
  })

  // 10. Traversal via extraPaths grant — cannot escape grant root
  it('denies a traversal that escapes an extraPaths grant root', () => {
    const grantedDir = join(resolve(process.cwd()), 'scoped-grant', 'inner')
    const traversal = join(grantedDir, '..', '..', 'outside.ts')
    const ws = makeWorkspace(null, [{ path: grantedDir, kind: 'read' }])
    // traversal resolves outside grantedDir → denied
    expect(PermissionGate.check(ws, traversal, 'read')).toBe(false)
  })

  // 11. Prefix-confusion on extraPaths grant
  it('denies a sibling path that shares a string prefix with an extraPaths grant but is not a child', () => {
    const grantedDir = join(resolve(process.cwd()), 'grant-dir')
    const sibling = grantedDir + sep + '..' + sep + 'grant-dir-evil'
    // This resolves to a sibling of grant-dir, not a child
    const ws = makeWorkspace(null, [{ path: grantedDir, kind: 'read' }])
    expect(PermissionGate.check(ws, sibling, 'read')).toBe(false)
  })

  // 12. Exact-boundary on extraPaths grant — the grant root itself is allowed
  it('allows the exact extraPaths grant path itself (boundary inclusive)', () => {
    const grantedDir = join(resolve(process.cwd()), 'exact-grant')
    const ws = makeWorkspace(null, [{ path: grantedDir, kind: 'read' }])
    expect(PermissionGate.check(ws, grantedDir, 'read')).toBe(true)
  })
})
