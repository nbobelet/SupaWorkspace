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
 * `--cd <cwd>` hands the launch directory to WSL. `cwd` is either a Windows
 * path (scoped to the workspace root by `getEffectiveCwd`, which WSL mounts
 * under /mnt) or a native Linux path the distro resolves directly — the host
 * process itself launches in a Win32 dir regardless (see SessionManager.launchCwd).
 * SCOPE NOTE: that scoping ends at launch. Once inside the
 * distro the user can `cd /home`, reach `\\wsl$\…`, the full Linux userland —
 * the Windows-side `workspace.rootPath` boundary does NOT cross into WSL.
 * Treat `\\wsl$\…` as out-of-scope for any file/explorer feature.
 *
 * No OSC 133 shell integration is injected: it keys off the *command name*
 * (`pwsh`/`bash`), and `wsl.exe` is neither — bash runs one process deeper,
 * inside the distro, so integration would need a wslpath-translated rcfile.
 * That is Tier-B work. WSL sessions ride the heuristic state path like cmd.exe.
 */
export function resolveWslCommand(
  cwd: string,
  innerCommand?: string[],
): {
  command: string
  args: string[]
  label: string
} {
  const wsl = findOnPath('wsl.exe')
  if (!wsl) {
    throw new Error('wsl.exe not found in PATH. Install WSL2 + an Ubuntu distro to use this shell.')
  }
  // No `innerCommand` -> WSL launches the distro's default login shell
  // interactively. With one (e.g. claude), wrap it past `--` so it runs
  // *inside* the distro at `cwd`; the caller is responsible for picking a form
  // that resolves the binary (a login+interactive shell sources the PATH).
  const args = ['-d', WSL_DISTRO, '--cd', cwd]
  if (innerCommand && innerCommand.length > 0) args.push('--', ...innerCommand)
  return {
    command: wsl,
    args,
    label: WSL_LABEL,
  }
}
