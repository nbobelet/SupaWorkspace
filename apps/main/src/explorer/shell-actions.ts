import { shell } from 'electron'

/**
 * Shell-level file actions for the Explorer sub-app, extracted from the IPC
 * handlers so they can be unit-tested in isolation from `ipcMain`.
 *
 * SCOPE-CLAMP PRECONDITION: callers MUST pass an absolute path already clamped
 * to the granted workspace scope (see `clampToScope` in `index.ts`). These
 * functions do NOT re-validate scope — they assume the boundary check already
 * happened upstream. Passing an un-clamped path here is a security bug.
 */

export interface OpenResult {
  /** True when the OS reported the path was handed off successfully. */
  opened: boolean
  /** Non-empty OS error string when `opened` is false; undefined on success. */
  error?: string
}

export interface RevealResult {
  /** Reveal is fire-and-forget at the OS level; we only report we issued it. */
  revealed: boolean
}

/**
 * Open `absPath` with the OS default application (`shell.openPath`).
 * `shell.openPath` resolves to '' on success or a non-empty error string.
 */
export async function openPath(absPath: string): Promise<OpenResult> {
  const error = await shell.openPath(absPath)
  if (error) return { opened: false, error }
  return { opened: true }
}

/**
 * Reveal `absPath` in the OS file manager (`shell.showItemInFolder`):
 * Explorer on win32, Finder on darwin, the default file manager on linux.
 * Synchronous and void at the Electron API level — there is no success signal,
 * so we report only that the request was issued.
 */
export function revealInFileManager(absPath: string): RevealResult {
  shell.showItemInFolder(absPath)
  return { revealed: true }
}
