import type Store from 'electron-store'
import { z } from 'zod'
import { SubAppStore } from '../sub-apps/SubAppStore'

const NoteContentSchema = z.string()

/**
 * Per-workspace plain-text scratchpad. Storage shape moved to the generic
 * sub-app envelope (`{ byWorkspace: Record<wsId, string> }`) so future
 * sub-apps share the same pattern; the on-disk key is unchanged and the
 * IPC contract (`notes:get` / `notes:set`) is unchanged too.
 *
 * Carries a lazy migration for the v0 `userNotes` global string: drained
 * into the first workspace that requests its notes, then deleted from
 * the file. The drain runs at most once per process — same in-memory
 * Store ref as the base class, so there is no race with the byWorkspace
 * write.
 */
export class NotesStore extends SubAppStore<string> {
  private legacyDrained = false

  constructor() {
    super({
      id: 'notes',
      defaultValue: () => '',
      schema: NoteContentSchema,
    })
  }

  override get(workspaceId: string): string {
    const direct = super.get(workspaceId)
    if (direct !== '' || this.legacyDrained) return direct
    return this.drainLegacyIfPresent(workspaceId)
  }

  private drainLegacyIfPresent(workspaceId: string): string {
    this.legacyDrained = true
    const raw = this.store as unknown as Store<{
      byWorkspace: Record<string, string>
      userNotes?: string
    }> & { delete: (key: string) => void }

    const legacy = (raw.get('userNotes' as never, '' as never) as unknown) as string
    if (typeof legacy !== 'string' || legacy.length === 0) return ''
    const byWorkspace = raw.get('byWorkspace', {})
    if (Object.keys(byWorkspace).length > 0) return ''

    raw.set('byWorkspace', { ...byWorkspace, [workspaceId]: legacy })
    raw.delete('userNotes')
    console.log(`[notes] migrated legacy userNotes -> workspace ${workspaceId}`)
    return legacy
  }
}
