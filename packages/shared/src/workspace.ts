import { z } from 'zod'

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
