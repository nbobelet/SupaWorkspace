import { existsSync } from 'node:fs'

/**
 * Resolves an executable name to its absolute path by scanning `PATH`. On
 * win32 it honours `PATHEXT` so a bare name (`pwsh`) matches `pwsh.exe`.
 * Returns null when nothing is found — callers decide whether that is fatal.
 */
export function findOnPath(name: string): string | null {
  const pathEnv = process.env['PATH'] ?? ''
  const pathSep = process.platform === 'win32' ? ';' : ':'
  const exts =
    process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : ['']
  const dirSep = process.platform === 'win32' ? '\\' : '/'
  for (const dir of pathEnv.split(pathSep)) {
    if (!dir) continue
    for (const ext of exts) {
      const full =
        name.includes('.') || ext === '' ? `${dir}${dirSep}${name}` : `${dir}${dirSep}${name}${ext}`
      if (existsSync(full)) return full
    }
  }
  return null
}
