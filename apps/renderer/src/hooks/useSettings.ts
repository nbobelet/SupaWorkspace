import { useEffect, useState } from 'react'
import type { Settings, SettingsUpdatePayload } from '@shared/ipc'

/**
 * Module-level cache so every mounted hook instance shares the same
 * snapshot — avoids spawning N concurrent `settings:get` IPC calls when
 * multiple panes mount at once. The cache is invalidated by `update()`.
 */
let cached: Settings | null = null
const listeners = new Set<(s: Settings) => void>()

async function fetchSettings(): Promise<Settings> {
  const next = await window.ws.settings.get()
  cached = next
  for (const fn of listeners) fn(next)
  return next
}

export async function updateSettings(payload: SettingsUpdatePayload): Promise<Settings> {
  const next = await window.ws.settings.update(payload)
  cached = next
  for (const fn of listeners) fn(next)
  return next
}

/**
 * React hook returning the typed app-wide settings.
 *
 * Returns `null` on the initial render before the first IPC roundtrip
 * resolves — callers must handle the null case (typical pattern: skip
 * the side-effect until settings is non-null).
 */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(cached)
  useEffect(() => {
    listeners.add(setSettings)
    if (cached === null) {
      void fetchSettings().catch(() => {
        // best-effort — leave `cached` null, the hook re-tries on next mount
      })
    }
    return () => {
      listeners.delete(setSettings)
    }
  }, [])
  return settings
}
