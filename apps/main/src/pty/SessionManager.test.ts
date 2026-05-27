import { homedir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { spawn as ptySpawn } from '@homebridge/node-pty-prebuilt-multiarch'
import { SessionManager, type SessionManagerEvents } from './SessionManager'

vi.mock('@homebridge/node-pty-prebuilt-multiarch', () => ({ spawn: vi.fn() }))
vi.mock('./findOnPath', () => ({ findOnPath: vi.fn((name: string) => `C:\\bin\\${name}`) }))
// Tracing writes to disk; stub it out so the manager stays a pure unit.
vi.mock('./traceWriter', () => ({ createTraceWriter: vi.fn(() => null) }))

const mockedSpawn = vi.mocked(ptySpawn)
const realPlatform = process.platform

interface FakePty {
  onData: ReturnType<typeof vi.fn>
  onExit: ReturnType<typeof vi.fn>
  kill: ReturnType<typeof vi.fn>
  resize: ReturnType<typeof vi.fn>
  write: ReturnType<typeof vi.fn>
  cols: number
  rows: number
  exit: (code: number) => void
}

function makePty(cols = 80, rows = 24): FakePty {
  let exitCb: ((e: { exitCode: number; signal?: number }) => void) | undefined
  return {
    onData: vi.fn(),
    onExit: vi.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
      exitCb = cb
    }),
    kill: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
    cols,
    rows,
    exit: (code: number) => exitCb?.({ exitCode: code }),
  }
}

function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value, configurable: true })
}

function noopEvents(): SessionManagerEvents {
  return { onData: vi.fn(), onExit: vi.fn(), onState: vi.fn() }
}

/** The `cwd` option node-pty was launched with on the Nth spawn (0-indexed). */
function spawnCwd(nth: number): string {
  const call = mockedSpawn.mock.calls[nth]
  return (call?.[2] as { cwd: string }).cwd
}

/** The argv node-pty was launched with on the Nth spawn. */
function spawnArgs(nth: number): string[] {
  return (mockedSpawn.mock.calls[nth]?.[1] as string[]) ?? []
}

beforeEach(() => {
  setPlatform('win32')
  mockedSpawn.mockImplementation(() => makePty() as unknown as ReturnType<typeof ptySpawn>)
})

afterEach(() => {
  setPlatform(realPlatform)
  vi.clearAllMocks()
})

describe('SessionManager.spawn — launch cwd by session type × path style', () => {
  const LINUX = '/home/nico/projet'
  const WIN = 'C:\\Users\\Nico\\proj'

  it('wsl + Linux path: launches the wsl.exe process in homedir, hands the Linux path to --cd', () => {
    const mgr = new SessionManager(noopEvents())
    const config = mgr.spawn({ workspaceId: 'w1', cwd: LINUX, type: 'wsl', cols: 80, rows: 24 })

    // The Win32 process must NOT launch in the Linux path (would ENOENT) ...
    expect(spawnCwd(0)).toBe(homedir())
    // ... the distro receives it via --cd ...
    expect(spawnArgs(0)).toContain('--cd')
    expect(spawnArgs(0)).toContain(LINUX)
    // ... and the logical session cwd stays the Linux path.
    expect(config.cwd).toBe(LINUX)
  })

  it('wsl + Windows path: launches in the Windows path unchanged', () => {
    const mgr = new SessionManager(noopEvents())
    const config = mgr.spawn({ workspaceId: 'w1', cwd: WIN, type: 'wsl', cols: 80, rows: 24 })

    expect(spawnCwd(0)).toBe(WIN)
    expect(spawnArgs(0)).toEqual(['-d', 'Ubuntu', '--cd', WIN])
    expect(config.cwd).toBe(WIN)
  })

  it('non-wsl (shell) + Windows path: launches in the Windows path unchanged', () => {
    const mgr = new SessionManager(noopEvents())
    const config = mgr.spawn({ workspaceId: 'w1', cwd: WIN, type: 'shell', cols: 80, rows: 24 })

    expect(spawnCwd(0)).toBe(WIN)
    expect(config.cwd).toBe(WIN)
  })
})

describe('SessionManager.respawnWorkspaceSessions — follow a workdir change', () => {
  it('respawns a live WSL session on the new cwd, keeping its id; leaves non-wsl untouched', () => {
    const events = noopEvents()
    const mgr = new SessionManager(events)

    const wsl = mgr.spawn({ workspaceId: 'w1', cwd: '/old', type: 'wsl', cols: 120, rows: 40 })
    const shell = mgr.spawn({
      workspaceId: 'w1',
      cwd: 'C:\\old',
      type: 'shell',
      cols: 80,
      rows: 24,
    })
    const oldPty = mockedSpawn.mock.results[0]?.value as FakePty
    mockedSpawn.mockClear()

    const n = mgr.respawnWorkspaceSessions('w1', 'wsl', '/home/nico/projet')

    expect(n).toBe(1)
    expect(oldPty.kill).toHaveBeenCalledOnce()
    // Exactly one new PTY (the wsl one); the shell was not touched.
    expect(mockedSpawn).toHaveBeenCalledOnce()
    expect(spawnArgs(0)).toContain('/home/nico/projet')
    expect(spawnCwd(0)).toBe(homedir()) // Linux path -> Win32 launch in homedir
    // Same session id, new logical cwd, preserved geometry.
    expect(mgr.getConfig(wsl.id)?.cwd).toBe('/home/nico/projet')
    expect(mgr.getConfig(shell.id)?.cwd).toBe('C:\\old')
    expect(mgr.list()).toHaveLength(2)
  })

  it("a respawned PTY's stale exit does not tear down the session that replaced it", () => {
    const events = noopEvents()
    const mgr = new SessionManager(events)

    const wsl = mgr.spawn({ workspaceId: 'w1', cwd: '/old', type: 'wsl', cols: 80, rows: 24 })
    const oldPty = mockedSpawn.mock.results[0]?.value as FakePty

    mgr.respawnWorkspaceSessions('w1', 'wsl', '/new')
    // The killed old PTY fires its exit asynchronously, after the replacement.
    oldPty.exit(0)

    expect(mgr.getConfig(wsl.id)).toBeDefined()
    expect(mgr.list()).toHaveLength(1)
    expect(events.onExit).not.toHaveBeenCalled()
  })
})
