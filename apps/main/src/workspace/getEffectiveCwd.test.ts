import { homedir, tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { getEffectiveCwd } from './getEffectiveCwd'

// tmpdir() is a real directory on every host -> usableDir accepts it; an
// absolute Windows path like C:\… does not exist on this Linux test host, so
// it stands in for "a path the Win32 fs cannot stat" the same way a distro
// path can't be statted from Windows.
const REAL_DIR = tmpdir()
const WIN_ROOT = 'C:\\Users\\Nico'

describe('getEffectiveCwd', () => {
  it('prefers rootPath when it is a usable directory', () => {
    expect(getEffectiveCwd({ rootPath: REAL_DIR, workdir: null })).toBe(REAL_DIR)
  })

  it('falls back to homedir when neither path is usable', () => {
    expect(getEffectiveCwd({ rootPath: null, workdir: null })).toBe(homedir())
  })

  describe('wsl sessions', () => {
    it('uses a Linux workdir verbatim, overriding a Windows rootPath', () => {
      expect(getEffectiveCwd({ rootPath: WIN_ROOT, workdir: '/home/nico/proj' }, 'wsl')).toBe(
        '/home/nico/proj',
      )
    })

    it('honors a Linux rootPath when no workdir is set', () => {
      expect(getEffectiveCwd({ rootPath: '/home/nico/proj', workdir: null }, 'wsl')).toBe(
        '/home/nico/proj',
      )
    })

    it('falls through to the normal chain when no Linux path is present', () => {
      // No Linux path -> Windows rootPath fails usableDir on this host -> homedir.
      expect(getEffectiveCwd({ rootPath: WIN_ROOT, workdir: null }, 'wsl')).toBe(homedir())
    })
  })

  it('does NOT special-case Linux paths for non-wsl sessions', () => {
    // A bare "/home/nico/proj" that does not exist here is rejected for a shell
    // session -> homedir, not passed through.
    expect(getEffectiveCwd({ rootPath: '/no/such/dir/xyz', workdir: null }, 'shell')).toBe(
      homedir(),
    )
  })
})
