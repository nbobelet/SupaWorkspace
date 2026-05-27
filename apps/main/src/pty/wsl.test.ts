import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findOnPath } from './findOnPath'
import { applyShellIntegration } from './shellIntegration'
import { isWslAvailable, resolveWslCommand } from './wsl'

vi.mock('./findOnPath', () => ({ findOnPath: vi.fn() }))

const mockedFindOnPath = vi.mocked(findOnPath)
const realPlatform = process.platform

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

afterEach(() => {
  setPlatform(realPlatform)
  vi.clearAllMocks()
})

describe('resolveWslCommand', () => {
  beforeEach(() => setPlatform('win32'))

  it('builds wsl.exe with the hardcoded Ubuntu distro and translates cwd via --cd', () => {
    mockedFindOnPath.mockReturnValue('C:\\Windows\\System32\\wsl.exe')

    const resolved = resolveWslCommand('C:\\Users\\Nico\\proj')

    expect(resolved.command).toBe('C:\\Windows\\System32\\wsl.exe')
    expect(resolved.args).toEqual(['-d', 'Ubuntu', '--cd', 'C:\\Users\\Nico\\proj'])
    expect(resolved.label).toBe('Ubuntu (WSL)')
  })

  it('throws a clear error when wsl.exe is not installed (graceful, no crash)', () => {
    mockedFindOnPath.mockReturnValue(null)

    expect(() => resolveWslCommand('C:\\anywhere')).toThrow(/wsl\.exe not found/)
  })
})

describe('isWslAvailable', () => {
  it('is true only on win32 with wsl.exe on PATH', () => {
    setPlatform('win32')
    mockedFindOnPath.mockReturnValue('C:\\Windows\\System32\\wsl.exe')
    expect(isWslAvailable()).toBe(true)
  })

  it('is false on win32 when wsl.exe is absent', () => {
    setPlatform('win32')
    mockedFindOnPath.mockReturnValue(null)
    expect(isWslAvailable()).toBe(false)
  })

  it('is false on non-win32 hosts without even probing PATH', () => {
    setPlatform('linux')
    mockedFindOnPath.mockReturnValue('/usr/bin/wsl.exe')
    expect(isWslAvailable()).toBe(false)
    expect(mockedFindOnPath).not.toHaveBeenCalled()
  })
})

describe('WSL is shell-class but gets no OSC 133 injection (Tier A)', () => {
  it('leaves wsl.exe args untouched — integration keys off pwsh/bash, not wsl.exe', () => {
    const baseArgs = ['-d', 'Ubuntu', '--cd', 'C:\\proj']
    expect(applyShellIntegration('C:\\Windows\\System32\\wsl.exe', baseArgs)).toEqual(baseArgs)
  })
})
