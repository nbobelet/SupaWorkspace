import { ipcMain } from 'electron'
import { IpcChannel, type CapabilitiesResponse } from '@shared/ipc'
import { isWslAvailable } from '../pty/wsl'

/**
 * Registers `capabilities:get`. Probes host-dependent shell availability so the
 * renderer can hide affordances the OS can't satisfy. Read-only, no payload.
 */
export function registerCapabilitiesIpc(): () => void {
  ipcMain.handle(IpcChannel.CapabilitiesGet, async (): Promise<CapabilitiesResponse> => {
    return { wsl: isWslAvailable() }
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.CapabilitiesGet)
  }
}
