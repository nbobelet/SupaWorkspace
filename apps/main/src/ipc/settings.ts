import { ipcMain } from 'electron'
import { IpcChannel, SettingsUpdatePayloadZ, SettingsZ, type Settings } from '@shared/ipc'
import type { SettingsStore } from '../settings/SettingsStore'

/**
 * Registers `settings:get` and `settings:update` handlers.
 *
 * Both handlers validate at the IPC boundary:
 *  - `get` re-parses the loaded settings through `SettingsZ` so a
 *    `clearInvalidConfig`-reset never silently propagates a default
 *    schema mismatch into the renderer.
 *  - `update` parses the raw payload through `SettingsUpdatePayloadZ`,
 *    merges via `SettingsStore.update`, then re-parses the merged result
 *    through `SettingsZ` — keys outside the schema are rejected.
 */
export function registerSettingsIpc(opts: { settingsStore: SettingsStore }): () => void {
  const { settingsStore } = opts

  ipcMain.handle(IpcChannel.SettingsGet, async (): Promise<Settings> => {
    return SettingsZ.parse(settingsStore.get())
  })

  ipcMain.handle(IpcChannel.SettingsUpdate, async (_, raw): Promise<Settings> => {
    const patch = SettingsUpdatePayloadZ.parse(raw)
    const merged = settingsStore.update(patch)
    return SettingsZ.parse(merged)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.SettingsGet)
    ipcMain.removeHandler(IpcChannel.SettingsUpdate)
  }
}
