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
  WorkspaceRestore: 'workspace:restore',
  WorkspacePurge: 'workspace:purge',
  WorkspaceListDeleted: 'workspace:list-deleted',
  WorkspaceReveal: 'workspace:reveal',
  WorkspaceReadClaudeMd: 'workspace:read-claude-md',
  WorkspaceWriteClaudeMd: 'workspace:write-claude-md',
  WorkspaceReadSettings: 'workspace:read-settings',
  WorkspaceWriteSettings: 'workspace:write-settings',
  WorkspaceSetColor: 'workspace:set-color',
  WorkspaceSetWorkdir: 'workspace:set-workdir',
  PermissionsRequestPath: 'permissions:request-path',
  PermissionsRevokePath: 'permissions:revoke-path',
  PermissionsGrantConflicts: 'permissions:grant-conflicts',
  NotifPush: 'notif:push',
  NotesGet: 'notes:get',
  NotesSet: 'notes:set',
  SessionSnapshotList: 'session-snapshot:list',
  SessionSnapshotClear: 'session-snapshot:clear',
  CmdGuardGet: 'cmd-guard:get',
  CmdGuardSetRules: 'cmd-guard:set-rules',
  CmdGuardAppendAudit: 'cmd-guard:append-audit',
  BugReportCreate: 'bug-report:create',
  BugReportList: 'bug-report:list',
  BugReportRevealDir: 'bug-report:reveal-dir',
  SettingsGet: 'settings:get',
  SettingsUpdate: 'settings:update',
  ExplorerListDir: 'explorer:list-dir',
  ExplorerOpen: 'explorer:open',
  ExplorerReveal: 'explorer:reveal',
  ExplorerReadFile: 'explorer:read-file',
  ExplorerSearch: 'explorer:search',
  ExplorerSearchCancel: 'explorer:search-cancel',
  VoiceTranscribe: 'voice:transcribe',
  CapabilitiesGet: 'capabilities:get',
} as const
export type IpcChannelName = (typeof IpcChannel)[keyof typeof IpcChannel]

export {
  BugReportSeverity,
  BugReportStatus,
  BugReportCreateRequest,
  BugReportCreateResponse,
  BugReportSummary,
  BugReportListResponse,
} from './bugReport'

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
  exitCode: z.number().int().nullable().optional(),
})
export type SessionStateEvent = z.infer<typeof SessionStateEvent>

export const SessionFocusEvent = z.object({
  sessionId: z.string().uuid(),
  workspaceId: z.string().uuid().optional(),
})
export type SessionFocusEvent = z.infer<typeof SessionFocusEvent>

/**
 * Host capabilities probed once at startup so the renderer can hide launch
 * affordances for shells the OS can't provide. `wsl` is true only on win32
 * with `wsl.exe` resolvable on PATH — never crash a host without WSL.
 */
export const CapabilitiesResponse = z.object({
  wsl: z.boolean(),
})
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponse>

export const WorkspaceOpenResponse = z.object({
  workspace: Workspace.nullable(),
  wasExisting: z.boolean().optional(),
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

/** Move a soft-deleted workspace back to the active list (clears `deletedAt`). */
export const WorkspaceRestoreRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type WorkspaceRestoreRequest = z.infer<typeof WorkspaceRestoreRequest>

/** Permanent, irreversible delete — drops the workspace AND its sub-app data. */
export const WorkspacePurgeRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type WorkspacePurgeRequest = z.infer<typeof WorkspacePurgeRequest>

/** Trash listing — soft-deleted workspaces, most-recently-deleted first. */
export const WorkspaceListDeletedResponse = z.object({
  workspaces: z.array(Workspace),
})
export type WorkspaceListDeletedResponse = z.infer<typeof WorkspaceListDeletedResponse>

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

export const WorkspaceSetWorkdirRequest = z.object({
  workspaceId: z.string().uuid(),
  workdir: z.string().nullable(),
})
export type WorkspaceSetWorkdirRequest = z.infer<typeof WorkspaceSetWorkdirRequest>

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

export const NotesGetRequest = z.object({
  workspaceId: z.string().uuid(),
})
export type NotesGetRequest = z.infer<typeof NotesGetRequest>

export const NotesGetResponse = z.object({
  content: z.string(),
})
export type NotesGetResponse = z.infer<typeof NotesGetResponse>

export const NotesSetRequest = z.object({
  workspaceId: z.string().uuid(),
  content: z.string().max(1_000_000),
})
export type NotesSetRequest = z.infer<typeof NotesSetRequest>

/**
 * App-wide settings — currently only governs the clipboard / progress
 * cross-cutting concerns introduced in QW4. New keys go here as the
 * settings UI grows; the schema is validated on every `settings:get` and
 * every partial-merge in `settings:update`.
 *
 * Conservative defaults — see `SettingsStore`:
 *  - `allowOscWrite: true`  (OSC 52 paste-from-PTY enabled, parity with iTerm)
 *  - `allowOscRead: false`  (PTY-side clipboard read disabled; exfiltration vector)
 *  - `notifyOnLongProgressComplete: false` (off by default; reserved for a
 *    future Notifier wave, not yet wired)
 */
/**
 * Push-to-talk voice capture settings. `enabled` gates the feature wholesale;
 * `pushToTalkKey` is the hold-chord (default `Ctrl+Shift+M`), rebindable here —
 * the app has no `keybindings.json`, so the keybind lives in app settings.
 * Added in the voice-to-claude-pane wave with a `.default` on the parent so a
 * pre-existing `settings.json` (no `voice` key) still validates on `get`.
 */
export const VoiceSettingsZ = z.object({
  enabled: z.boolean(),
  pushToTalkKey: z.string().min(1),
})
export type VoiceSettings = z.infer<typeof VoiceSettingsZ>

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  enabled: true,
  pushToTalkKey: 'Ctrl+Shift+M',
}

export const SettingsZ = z.object({
  clipboard: z.object({
    allowOscWrite: z.boolean(),
    allowOscRead: z.boolean(),
    notifyOnLongProgressComplete: z.boolean(),
  }),
  voice: VoiceSettingsZ.default(DEFAULT_VOICE_SETTINGS),
})
export type Settings = z.infer<typeof SettingsZ>

/**
 * Partial-update payload for `settings:update`. The handler deep-merges
 * the partial onto the current settings, validates the result with
 * `SettingsZ`, and returns the full new settings object.
 */
export const SettingsUpdatePayloadZ = z.object({
  clipboard: z
    .object({
      allowOscWrite: z.boolean().optional(),
      allowOscRead: z.boolean().optional(),
      notifyOnLongProgressComplete: z.boolean().optional(),
    })
    .optional(),
  voice: z
    .object({
      enabled: z.boolean().optional(),
      pushToTalkKey: z.string().min(1).optional(),
    })
    .optional(),
})
export type SettingsUpdatePayload = z.infer<typeof SettingsUpdatePayloadZ>

/**
 * Per-file working-tree state, derived from `git status --porcelain=v2`.
 * `clean` is implicit (absent `gitStatus`). The renderer maps these onto
 * decorations (color dot / letter) in the Miller column. Mirrors the subset
 * of porcelain XY codes the Explorer cares about; anything else collapses to
 * `modified` so an unknown future state still renders as "dirty".
 */
export const FileGitStatus = z.enum([
  'modified',
  'added',
  'deleted',
  'renamed',
  'untracked',
  'ignored',
  'conflicted',
])
export type FileGitStatus = z.infer<typeof FileGitStatus>

export const FileEntry = z.object({
  name: z.string(),
  /** Absolute path on disk (already clamped to the workspace scope by main). */
  path: z.string(),
  type: z.enum(['file', 'dir']),
  gitStatus: FileGitStatus.optional(),
  /** Byte size for files; 0 for directories (no recursive sizing). */
  size: z.number().int().min(0),
})
export type FileEntry = z.infer<typeof FileEntry>

export const ExplorerListDirRequest = z.object({
  workspaceId: z.string().uuid(),
  /** Directory relative to the workspace rootPath. Empty string = root. */
  relPath: z.string(),
})
export type ExplorerListDirRequest = z.infer<typeof ExplorerListDirRequest>

/**
 * `status: 'ok'` carries one directory level of entries. `status:
 * 'needs-grant'` signals the requested path resolves outside the workspace
 * scope — the renderer routes the user through the PathGrant flow
 * (`window.ws.permissions.requestPath`) rather than treating it as an error.
 */
export const ExplorerListDirResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    relPath: z.string(),
    entries: z.array(FileEntry),
  }),
  z.object({
    status: z.literal('needs-grant'),
    path: z.string(),
  }),
])
export type ExplorerListDirResponse = z.infer<typeof ExplorerListDirResponse>

export const ExplorerOpenRequest = z.object({
  workspaceId: z.string().uuid(),
  relPath: z.string(),
})
export type ExplorerOpenRequest = z.infer<typeof ExplorerOpenRequest>

export const ExplorerOpenResponse = z.object({
  opened: z.boolean(),
})
export type ExplorerOpenResponse = z.infer<typeof ExplorerOpenResponse>

export const ExplorerRevealRequest = z.object({
  workspaceId: z.string().uuid(),
  relPath: z.string(),
})
export type ExplorerRevealRequest = z.infer<typeof ExplorerRevealRequest>

export const ExplorerReadFileRequest = z.object({
  workspaceId: z.string().uuid(),
  /** File relative to the workspace rootPath. */
  relPath: z.string(),
  /** Bypass the head cap and read the whole file (the "Load full file" path). */
  full: z.boolean().optional(),
})
export type ExplorerReadFileRequest = z.infer<typeof ExplorerReadFileRequest>

/**
 * Content preview of a single file for the Explorer's rightmost panel.
 *
 * - `text`: decoded UTF-8 content, capped to the first 256 KB unless `full` was
 *   requested. `truncated` flags that more bytes exist on disk than `content`
 *   carries (the UI offers "Load full file"). `size` is the on-disk byte size.
 * - `image`: a base64 data URL the renderer drops straight into an `<img>`.
 * - `binary`: not previewable (null byte in the head, or oversized image).
 * - `needs-grant`: the path resolves outside the workspace scope — same
 *   PathGrant flow as `ExplorerListDirResponse`.
 */
export const ExplorerReadFileResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('text'),
    content: z.string(),
    encoding: z.literal('utf8'),
    truncated: z.boolean(),
    size: z.number().int().min(0),
  }),
  z.object({
    status: z.literal('image'),
    dataUrl: z.string(),
    mime: z.string(),
    size: z.number().int().min(0),
  }),
  z.object({
    status: z.literal('binary'),
    size: z.number().int().min(0),
  }),
  z.object({
    status: z.literal('needs-grant'),
    path: z.string(),
  }),
])
export type ExplorerReadFileResponse = z.infer<typeof ExplorerReadFileResponse>

export const ExplorerSearchRequest = z.object({
  workspaceId: z.string().uuid(),
  /** Raw user query. Matching/ranking happens renderer-side; main only walks
   * the tree and returns capped candidates (one canonical fuzzy matcher). */
  query: z.string(),
  /** Monotonic per-renderer search id. `invoke` cannot carry an AbortSignal
   * across the process boundary, so the renderer tags each search with an id
   * and cancels the in-flight walk via `ExplorerSearchCancel(workspaceId, id)`.
   */
  searchId: z.number().int().min(0),
})
export type ExplorerSearchRequest = z.infer<typeof ExplorerSearchRequest>

/**
 * Cancel an in-flight search walk. Fire-and-forget from the renderer: main sets
 * an aborted flag the recursive `walk` checks each iteration and bails early,
 * so fast typing never piles up concurrent full-tree walks. A `searchId` that
 * doesn't match the live walk is a no-op.
 */
export const ExplorerSearchCancelRequest = z.object({
  workspaceId: z.string().uuid(),
  searchId: z.number().int().min(0),
})
export type ExplorerSearchCancelRequest = z.infer<typeof ExplorerSearchCancelRequest>

/**
 * One file-search candidate. `relPath` is workspace-relative POSIX (the same
 * shape `listDir`/`reveal` consume), so a hit can be fed straight back into the
 * reveal flow without re-deriving paths from OS-specific absolutes.
 */
export const SearchHit = z.object({
  relPath: z.string(),
  name: z.string(),
  type: z.enum(['file', 'dir']),
})
export type SearchHit = z.infer<typeof SearchHit>

/**
 * `status: 'ok'` carries the capped candidate list (`truncated` flags the walk
 * hit its entry/depth budget). `needs-grant` mirrors the other explorer
 * channels: a workspace with a null rootPath (Home) can't be walked.
 * `cancelled` signals the walk was aborted by a newer search before completing
 * — the renderer must ignore it rather than treat the empty result as "no hits".
 */
export const ExplorerSearchResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    hits: z.array(SearchHit),
    truncated: z.boolean(),
  }),
  z.object({
    status: z.literal('needs-grant'),
    path: z.string(),
  }),
  z.object({
    status: z.literal('cancelled'),
  }),
])
export type ExplorerSearchResponse = z.infer<typeof ExplorerSearchResponse>

/**
 * Push-to-talk → local STT. The renderer captures mic audio while the hold-key
 * is down, downsamples to 16 kHz mono PCM (float32, little-endian bytes), and
 * submits it together with the session locked at *key-down* (`sessionId`).
 *
 * The audio never touches disk: it is a transient `Uint8Array` carried over IPC
 * once, decoded to a `Float32Array` view in main, transcribed in-memory, and
 * the backing buffer is zeroed immediately after (audio_retention_zero).
 *
 * `sessionId` is UNTRUSTED — main re-checks it is a currently-live `claude`
 * session before transcribing, and rejects otherwise (no transcript leaks for
 * a stale/spoofed id).
 */
export const VoiceTranscribeRequest = z.object({
  sessionId: z.string().uuid(),
  /** 16 kHz mono PCM float32 samples as raw little-endian bytes. */
  pcm: z.instanceof(Uint8Array),
  sampleRate: z.number().int().positive(),
  /** BCP-47 hint (e.g. `fr`, `en`); omitted = whisper auto-detect (FR/EN code-switch). */
  language: z.string().optional(),
})
export type VoiceTranscribeRequest = z.infer<typeof VoiceTranscribeRequest>

export const VoiceRejectReason = z.enum([
  'session-not-live', // sessionId is not a currently-live claude session
  'low-confidence', // transcript below the acceptance threshold
  'empty', // whisper returned no usable text
  'stt-unavailable', // model/binding not installed on this machine
])
export type VoiceRejectReason = z.infer<typeof VoiceRejectReason>

/**
 * `ok` carries the transcript the renderer stages (un-sent) in the target pane.
 * `rejected` carries a machine-reason the renderer surfaces as a transient
 * badge — never an exception, so a misheard/blocked utterance is a no-op, not a
 * crash. No transcript is ever returned on the `rejected` branch.
 */
export const VoiceTranscribeResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('ok'),
    sessionId: z.string().uuid(),
    transcript: z.string(),
    confidence: z.number().min(0).max(1),
  }),
  z.object({
    status: z.literal('rejected'),
    reason: VoiceRejectReason,
    confidence: z.number().min(0).max(1).optional(),
  }),
])
export type VoiceTranscribeResponse = z.infer<typeof VoiceTranscribeResponse>
