/**
 * Rebuild the optional `smart-whisper` native binding against the *Electron* ABI
 * (not the system Node ABI pnpm's install-time build targets). Run this once
 * after `pnpm add smart-whisper`, and again whenever the Electron major changes.
 *
 *   pnpm rebuild:voice
 *
 * Windows needs the "Desktop development with C++" workload (VS 2022); the
 * `--msvs_version=2022` hint steers node-gyp past a too-new VS that its detector
 * can't yet parse. See docs/how-to/use-voice-input.md.
 */
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const electronVersion = (require('electron/package.json') as { version: string }).version
const nodeGyp = require.resolve('node-gyp/bin/node-gyp.js')
// Resolve the *actual* package dir (pnpm relocates patched deps into a
// `…_patch_h_<hash>` store path), not the `node_modules/smart-whisper` symlink —
// node-gyp must build into the dir the runtime require() actually loads.
const pkgDir = join(dirname(require.resolve('smart-whisper')), '..')

const args = [
  nodeGyp,
  'rebuild',
  '-C',
  pkgDir,
  `--target=${electronVersion}`,
  '--dist-url=https://electronjs.org/headers',
  `--arch=${process.arch}`,
]
if (process.platform === 'win32') args.push('--msvs_version=2022')

console.log(
  `[rebuild-voice] building smart-whisper for Electron ${electronVersion} (${process.arch})`,
)
execFileSync(process.execPath, args, { stdio: 'inherit' })
console.log('[rebuild-voice] done')
