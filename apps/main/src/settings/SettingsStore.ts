import Store from 'electron-store'
import type { Settings, SettingsUpdatePayload } from '@shared/ipc'

/**
 * On-disk shape mirrors the renderer-facing `Settings` schema. We keep
 * them in lock-step so a malformed file is detected at parse-time on the
 * IPC boundary (`SettingsZ.parse(store.get('settings'))`) rather than by
 * runtime crashes deep in the terminal mount path.
 */
interface SettingsShape {
  settings: Settings
}

const DEFAULTS: Settings = {
  clipboard: {
    allowOscWrite: true,
    allowOscRead: false,
    notifyOnLongProgressComplete: false,
  },
}

/**
 * Single-source-of-truth electron-store wrapper for app-wide settings.
 *
 * Mirrors `WorkspaceStore`'s shape exactly:
 *  - typed `Store<SettingsShape>` with `name` and `defaults`.
 *  - `clearInvalidConfig: true` so a malformed JSON (manual edit, partial
 *    write during quit) is dropped on next boot instead of refusing to
 *    open the app — the user re-applies their preferences via the
 *    settings UI.
 *
 * Storage path: `<userData>/settings.json` (the `name` field). Lives next
 * to `workspaces.json` / `input-history.json` / etc.
 */
export class SettingsStore {
  private readonly store: Store<SettingsShape>

  constructor() {
    this.store = new Store<SettingsShape>({
      name: 'settings',
      defaults: { settings: DEFAULTS },
      clearInvalidConfig: true,
    })
  }

  get(): Settings {
    return this.store.get('settings', DEFAULTS)
  }

  /**
   * Deep-merges `patch` onto the current settings and persists. Returns
   * the new settings object so callers don't need a second `get()` round
   * trip. The IPC handler validates the merged result with `SettingsZ`
   * before returning — `SettingsStore` itself does not validate (it
   * trusts its caller, which is always the validated IPC handler).
   */
  update(patch: SettingsUpdatePayload): Settings {
    const current = this.get()
    const next: Settings = {
      ...current,
      clipboard: {
        ...current.clipboard,
        ...(patch.clipboard ?? {}),
      },
    }
    this.store.set('settings', next)
    return next
  }
}
