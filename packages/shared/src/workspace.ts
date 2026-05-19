import { z } from 'zod'
import { SubAppId } from './sub-app'
import { SessionState } from './session'

export const PathGrant = z.object({
  path: z.string(),
  kind: z.enum(['read', 'write']),
  grantedAt: z.number().int(),
})
export type PathGrant = z.infer<typeof PathGrant>

export const WorkspacePermissions = z.object({
  extraPaths: z.array(PathGrant).default([]),
  allow: z.array(z.string()).default([]),
  deny: z.array(z.string()).default([]),
})
export type WorkspacePermissions = z.infer<typeof WorkspacePermissions>

export const WorkspaceColor = z.object({
  hue: z.number().min(0).max(360),
})
export type WorkspaceColor = z.infer<typeof WorkspaceColor>

export const Workspace = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rootPath: z.string(),
  createdAt: z.number().int(),
  lastOpenedAt: z.number().int(),
  permissions: WorkspacePermissions,
  color: WorkspaceColor.optional(),
})
export type Workspace = z.infer<typeof Workspace>

/**
 * Sidebar tree node — 3-level hierarchy rendered by `WorkspaceSidebar`:
 *   workspace -> sub-app -> tab (leaf)
 *
 * Discriminated on `kind` so the renderer narrows on a single literal field.
 * `z.lazy` is used on the parent variants to defer references to child
 * variants declared lower in the file (forward refs in const-binding order).
 * The tab leaf carries no `children` field.
 */
const TabNode = z.object({
  kind: z.literal('tab'),
  workspaceId: z.string().uuid(),
  subAppId: SubAppId,
  sessionId: z.string().uuid(),
  active: z.boolean().default(false),
  status: SessionState,
})

const SubAppNode = z.object({
  kind: z.literal('sub-app'),
  workspaceId: z.string().uuid(),
  subAppId: SubAppId,
  expanded: z.boolean().default(true),
  children: z.array(z.lazy(() => TabNode)),
})

const WorkspaceNode = z.object({
  kind: z.literal('workspace'),
  workspaceId: z.string().uuid(),
  expanded: z.boolean().default(true),
  children: z.array(z.lazy(() => SubAppNode)),
})

export const WorkspaceTreeNode = z.discriminatedUnion('kind', [
  WorkspaceNode,
  SubAppNode,
  TabNode,
])
export type WorkspaceTreeNode = z.infer<typeof WorkspaceTreeNode>
