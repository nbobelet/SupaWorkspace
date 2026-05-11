import { z } from 'zod'
import { SessionState, SessionType } from './session'
import { PathGrant, Workspace } from './workspace'

export const IpcChannel = {
  SessionSpawn: 'session:spawn',
  SessionWrite: 'session:write',
  SessionResize: 'session:resize',
  SessionKill: 'session:kill',
  SessionRename: 'session:rename',
  SessionData: 'session:data',
  SessionExit: 'session:exit',
  SessionState: 'session:state',
  SessionFocus: 'session:focus',
  WorkspaceList: 'workspace:list',
  WorkspaceOpen: 'workspace:open',
  WorkspaceRename: 'workspace:rename',
  WorkspaceRemove: 'workspace:remove',
  WorkspaceReveal: 'workspace:reveal',
  WorkspaceReadClaudeMd: 'workspace:read-claude-md',
  WorkspaceWriteClaudeMd: 'workspace:write-claude-md',
  WorkspaceReadSettings: 'workspace:read-settings',
  WorkspaceWriteSettings: 'workspace:write-settings',
  WorkspaceSetColor: 'workspace:set-color',
  PermissionsRequestPath: 'permissions:request-path',
  PermissionsRevokePath: 'permissions:revoke-path',
  PermissionsGrantConflicts: 'permissions:grant-conflicts',
  NotifPush: 'notif:push',
  NotesGet: 'notes:get',
  NotesSet: 'notes:set',
} as const
export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

export const SessionSpawnRequest = z.object({
  workspaceId: z.string().uuid(),
  type: SessionType,
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
  label: z.string().optional(),
})
export type SessionSpawnRequest = z.infer<typeof SessionSpawnRequest>

export const SessionSpawnResponse = z.object({
  sessionId: z.string().uuid(),
  label: z.string(),
})
export type SessionSpawnResponse = z.infer<typeof SessionSpawnResponse>

export const SessionWriteRequest = z.object({
  sessionId: z.string().uuid(),
  data: z.string(),
})
export type SessionWriteRequest = z.infer<typeof SessionWriteRequest>

export const SessionResizeRequest = z.object({
  sessionId: z.string().uuid(),
  cols: z.number().int().min(1).max(1000),
  rows: z.number().int().min(1).max(1000),
})
export type SessionResizeRequest = z.infer<typeof SessionResizeRequest>

export const SessionKillRequest = z.object({
  sessionId: z.string().uuid(),
})
export type SessionKillRequest = z.infer<typeof SessionKillRequest>

export const SessionRenameRequest = z.object({
  sessionId: z.string().uuid(),
  label: z.string().trim().min(1).max(100),
})
export type SessionRenameRequest = z.infer<typeof SessionRenameRequest>

export const SessionRenameResponse = z.object({
  sessionId: z.string().uuid(),
  label: z.string(),
})
export type SessionRenameResponse = z.infer<typeof SessionRenameResponse>

export const SessionDataEvent = z.object({
  sessionId: z.string().uuid(),
  data: z.string(),
})
export type SessionDataEvent = z.infer<typeof SessionDataEvent>

export const SessionExitEvent = z.object({
  sessionId: z.string().uuid(),
  exitCode: z.number().int(),
  signal: z.number().int().optional(),
})
export type SessionExitEvent = z.infer<typeof SessionExitEvent>

export const SessionStateEvent = z.object({
  sessionId: z.string().uuid(),
  state: SessionState,
})
export type SessionStateEvent = z.infer<typeof SessionStateEvent>

export const WorkspaceOpenResponse = z.object({
  workspace: Workspace.nullable(),
})
export type WorkspaceOpenResponse = z.infer<typeof WorkspaceOpenResponse>

export const WorkspaceListResponse = z.object({
  workspaces: z.array(Workspace),
})
export type WorkspaceListResponse = z.infer<typeof WorkspaceListResponse>

export const WorkspaceRenameRequest = z.object({
  workspaceId: z.string().uuid(),
  name: z.string().min(1).max(120),
})
export type WorkspaceRenameRequest = z.infer<typeof WorkspaceRenameRequest>

export const WorkspaceRemoveRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type WorkspaceRemoveRequest = z.infer<typeof WorkspaceRemoveRequest>

export const WorkspaceRevealRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type WorkspaceRevealRequest = z.infer<typeof WorkspaceRevealRequest>

export const WorkspaceReadClaudeMdRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type WorkspaceReadClaudeMdRequest = z.infer<typeof WorkspaceReadClaudeMdRequest>

export const WorkspaceReadClaudeMdResponse = z.object({
  content: z.string(),
  exists: z.boolean(),
})
export type WorkspaceReadClaudeMdResponse = z.infer<typeof WorkspaceReadClaudeMdResponse>

export const WorkspaceWriteClaudeMdRequest = z.object({
  workspaceId: z.string().uuid(),
  content: z.string(),
})
export type WorkspaceWriteClaudeMdRequest = z.infer<typeof WorkspaceWriteClaudeMdRequest>

export const ClaudeSettingsSchema = z
  .object({
    mcpServers: z.record(z.string(), z.unknown()).optional(),
    permissions: z
      .object({
        allow: z.array(z.string()).optional(),
        deny: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .passthrough()
export type ClaudeSettings = z.infer<typeof ClaudeSettingsSchema>

export const WorkspaceReadSettingsRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type WorkspaceReadSettingsRequest = z.infer<typeof WorkspaceReadSettingsRequest>

export const WorkspaceReadSettingsResponse = z.object({
  settings: ClaudeSettingsSchema,
  exists: z.boolean(),
})
export type WorkspaceReadSettingsResponse = z.infer<typeof WorkspaceReadSettingsResponse>

export const WorkspaceWriteSettingsRequest = z.object({
  workspaceId: z.string().uuid(),
  settings: ClaudeSettingsSchema,
})
export type WorkspaceWriteSettingsRequest = z.infer<typeof WorkspaceWriteSettingsRequest>

export const PermissionsRequestPathRequest = z.object({
  workspaceId: z.string().uuid(),
  path: z.string(),
  kind: z.enum(['read', 'write']),
})
export type PermissionsRequestPathRequest = z.infer<typeof PermissionsRequestPathRequest>

export const PermissionsRequestPathResponse = z.object({
  granted: z.boolean(),
  alwaysAllow: z.boolean(),
  grant: PathGrant.nullable(),
})
export type PermissionsRequestPathResponse = z.infer<typeof PermissionsRequestPathResponse>

export const PermissionsRevokePathRequest = z.object({
  workspaceId: z.string().uuid(),
  path: z.string(),
})
export type PermissionsRevokePathRequest = z.infer<typeof PermissionsRevokePathRequest>

export const WorkspaceSetColorRequest = z.object({
  workspaceId: z.string().uuid(),
  hue: z.number().min(0).max(360),
})
export type WorkspaceSetColorRequest = z.infer<typeof WorkspaceSetColorRequest>

export const PathGrantConflict = z.object({
  path: z.string(),
  workspaces: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      kind: z.enum(['read', 'write']),
    }),
  ),
})
export type PathGrantConflict = z.infer<typeof PathGrantConflict>

export const PermissionsGrantConflictsResponse = z.object({
  conflicts: z.array(PathGrantConflict),
})
export type PermissionsGrantConflictsResponse = z.infer<typeof PermissionsGrantConflictsResponse>

export const NotesGetResponse = z.object({
  content: z.string(),
})
export type NotesGetResponse = z.infer<typeof NotesGetResponse>

export const NotesSetRequest = z.object({
  content: z.string().max(1_000_000),
})
export type NotesSetRequest = z.infer<typeof NotesSetRequest>
