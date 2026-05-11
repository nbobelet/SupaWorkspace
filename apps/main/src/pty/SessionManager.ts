import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { spawn as ptySpawn, type IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import type { SessionConfig, SessionState, SessionType } from '@shared/session'
import { StateDetector } from './stateDetector'

export interface SessionManagerEvents {
  onData: (sessionId: string, data: string) => void
  onExit: (sessionId: string, exitCode: number, signal?: number) => void
  onState: (sessionId: string, state: SessionState) => void
}

export interface ResolvedSession {
  config: SessionConfig
  command: string
  args: string[]
}

interface ActiveSession {
  pty: IPty
  config: SessionConfig
}

export class SessionManager {
  private readonly sessions = new Map<string, ActiveSession>()
  private readonly stateDetector: StateDetector

  constructor(private readonly events: SessionManagerEvents) {
    this.stateDetector = new StateDetector({
      onStateChange: (id, state) => this.events.onState(id, state),
    })
  }

  spawn(opts: {
    workspaceId: string
    rootPath: string
    type: SessionType
    cols: number
    rows: number
    label?: string
  }): SessionConfig {
    const sessionId = randomUUID()
    const { command, args, label } = this.resolveCommand(opts.type, opts.label)

    const pty = ptySpawn(command, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.rootPath,
      env: process.env as Record<string, string>,
    })

    const config: SessionConfig = {
      id: sessionId,
      workspaceId: opts.workspaceId,
      type: opts.type,
      label,
      cwd: opts.rootPath,
      createdAt: Date.now(),
    }

    this.sessions.set(sessionId, { pty, config })
    this.stateDetector.register(sessionId)

    pty.onData((data) => {
      this.stateDetector.onData(sessionId, data)
      this.events.onData(sessionId, data)
    })

    pty.onExit(({ exitCode, signal }) => {
      this.stateDetector.onExit(sessionId, exitCode)
      this.events.onExit(sessionId, exitCode, signal)
      this.stateDetector.unregister(sessionId)
      this.sessions.delete(sessionId)
    })

    return config
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    this.stateDetector.onInput(sessionId)
    session.pty.write(data)
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    try {
      session.pty.resize(cols, rows)
    } catch (err) {
      console.warn(`[pty] resize failed for ${sessionId}`, err)
    }
  }

  kill(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    try {
      session.pty.kill()
    } catch (err) {
      console.warn(`[pty] kill failed for ${sessionId}`, err)
    }
  }

  killAll(): void {
    for (const id of [...this.sessions.keys()]) {
      this.kill(id)
    }
  }

  list(): SessionConfig[] {
    return [...this.sessions.values()].map((s) => s.config)
  }

  getConfig(sessionId: string): SessionConfig | undefined {
    return this.sessions.get(sessionId)?.config
  }

  rename(sessionId: string, label: string): SessionConfig | undefined {
    const session = this.sessions.get(sessionId)
    if (!session) return undefined
    session.config = { ...session.config, label }
    return session.config
  }

  private resolveCommand(type: SessionType, label?: string): {
    command: string
    args: string[]
    label: string
  } {
    if (type === 'claude') {
      const claudeCmd = this.resolveClaudeBinary()
      if (!claudeCmd) {
        throw new Error(
          'claude CLI not found in PATH. Install: https://docs.claude.com/en/docs/claude-code/quickstart',
        )
      }
      return {
        command: claudeCmd,
        args: [],
        label: label ?? 'claude',
      }
    }

    if (process.platform === 'win32') {
      const pwsh = this.findOnPath('pwsh.exe')
      if (pwsh) return { command: pwsh, args: [], label: label ?? 'pwsh' }
      const ps = this.findOnPath('powershell.exe')
      if (ps) return { command: ps, args: [], label: label ?? 'powershell' }
      return { command: 'cmd.exe', args: [], label: label ?? 'cmd' }
    }
    const shell = process.env['SHELL'] ?? '/bin/bash'
    return { command: shell, args: [], label: label ?? shell.split('/').pop() ?? 'shell' }
  }

  private resolveClaudeBinary(): string | null {
    const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude'
    return this.findOnPath(exeName) ?? this.findOnPath('claude')
  }

  private findOnPath(name: string): string | null {
    const pathEnv = process.env['PATH'] ?? ''
    const pathSep = process.platform === 'win32' ? ';' : ':'
    const exts = process.platform === 'win32' ? (process.env['PATHEXT'] ?? '.EXE;.CMD;.BAT').split(';') : ['']
    for (const dir of pathEnv.split(pathSep)) {
      if (!dir) continue
      for (const ext of exts) {
        const candidate = `${dir}${process.platform === 'win32' ? '\\' : '/'}${name}${ext.startsWith('.') ? '' : ''}`
        const full = name.includes('.') || ext === '' ? `${dir}${process.platform === 'win32' ? '\\' : '/'}${name}` : `${candidate}${ext}`
        if (existsSync(full)) return full
      }
    }
    return null
  }
}
