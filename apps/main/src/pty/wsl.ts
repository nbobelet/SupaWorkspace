import { findOnPath } from './findOnPath'

// Tier A: a single hardcoded distro. Distro enumeration (`wsl.exe -l -q`,
// UTF-16LE output) + a profile picker is deliberately out of scope here.
const WSL_DISTRO = 'Ubuntu'
const WSL_LABEL = 'Ubuntu (WSL)'

/** True only on win32 with `wsl.exe` resolvable — every other host hides WSL. */
export function isWslAvailable(): boolean {
  return process.platform === 'win32' && findOnPath('wsl.exe') !== null
}

/**
 * Builds the spawn command for the hardcoded WSL: Ubuntu session.
 *
 * `--cd <cwd>` hands the launch directory (a Windows path, already scoped to
 * the workspace root by `getEffectiveCwd`) to WSL, which translates it to the
 * distro's mount. SCOPE NOTE: that scoping ends at launch. Once inside the
 * distro the user can `cd /home`, reach `\\wsl$\…`, the full Linux userland —
 * the Windows-side `workspace.rootPath` boundary does NOT cross into WSL.
 * Treat `\\wsl$\…` as out-of-scope for any file/explorer feature.
 *
 * No OSC 133 shell integration is injected: it keys off the *command name*
 * (`pwsh`/`bash`), and `wsl.exe` is neither — bash runs one process deeper,
 * inside the distro, so integration would need a wslpath-translated rcfile.
 * That is Tier-B work. WSL sessions ride the heuristic state path like cmd.exe.
 */
export function resolveWslCommand(cwd: string): {
  command: string
  args: string[]
  label: string
} {
  const wsl = findOnPath('wsl.exe')
  if (!wsl) {
    throw new Error('wsl.exe not found in PATH. Install WSL2 + an Ubuntu distro to use this shell.')
  }
  return {
    command: wsl,
    args: ['-d', WSL_DISTRO, '--cd', cwd],
    label: WSL_LABEL,
  }
}
