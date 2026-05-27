import { randomUUID } from 'node:crypto'
import { spawn as ptySpawn, type IPty } from '@homebridge/node-pty-prebuilt-multiarch'
import type { SessionConfig, SessionState, SessionType } from '@shared/session'
import { findOnPath } from './findOnPath'
import { applyShellIntegration } from './shellIntegration'
import { StateDetector } from './stateDetector'
import { createTraceWriter, type TraceWriter } from './traceWriter'
import { resolveWslCommand } from './wsl'

export interface SessionManagerEvents {
  onData: (sessionId: string, data: string) => void
  onExit: (sessionId: string, exitCode: number, signal?: number) => void
  onState: (sessionId: string, state: SessionState, exitCode?: number | null) => void
  onUserInput?: (sessionId: string) => void
  onSessionsChanged?: (configs: SessionConfig[]) => void
}

export interface ResolvedSession {
  config: SessionConfig
  command: string
  args: string[]
}

interface ActiveSession {
  pty: IPty
  config: SessionConfig
  trace: TraceWriter | null
}

export class SessionManager {
  private readonly sessions = new Map<string, ActiveSession>()
  private readonly stateDetector: StateDetector

  constructor(private readonly events: SessionManagerEvents) {
    this.stateDetector = new StateDetector({
      onStateChange: (id, state, exitCode) => this.events.onState(id, state, exitCode),
    })
  }

  spawn(opts: {
    workspaceId: string
    cwd: string
    type: SessionType
    cols: number
    rows: number
    label?: string
  }): SessionConfig {
    const sessionId = randomUUID()
    const { command, args, label } = this.resolveCommand(opts.type, opts.label, opts.cwd)

    // Inject OSC 133 shell integration for real shells so the command
    // lifecycle (;C/;D) drives session state authoritatively. claude is a TUI
    // (input-driven, no shell integration) and is left untouched. wsl is
    // shell-class but no-ops here: integration keys off the command name and
    // wsl.exe matches neither pwsh nor bash (see resolveWslCommand).
    const spawnArgs = opts.type === 'claude' ? args : applyShellIntegration(command, args)

    const pty = ptySpawn(command, spawnArgs, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: opts.cwd,
      env: process.env as Record<string, string>,
    })

    const config: SessionConfig = {
      id: sessionId,
      workspaceId: opts.workspaceId,
      type: opts.type,
      label,
      cwd: opts.cwd,
      createdAt: Date.now(),
    }

    const trace = createTraceWriter(sessionId, opts.type)
    this.sessions.set(sessionId, { pty, config, trace })
    this.stateDetector.register(sessionId, opts.type)

    pty.onData((data) => {
      trace?.write(data)
      this.stateDetector.onData(sessionId, data)
      this.events.onData(sessionId, data)
    })

    pty.onExit(({ exitCode, signal }) => {
      this.stateDetector.onExit(sessionId, exitCode)
      this.events.onExit(sessionId, exitCode, signal)
      trace?.close()
      this.stateDetector.unregister(sessionId)
      this.sessions.delete(sessionId)
      this.events.onSessionsChanged?.(this.list())
    })

    this.events.onSessionsChanged?.(this.list())
    return config
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (!session) return
    // Pass the raw input so the detector can tell a command submit (contains
    // a carriage return) from plain keystrokes — typing must not flip the
    // session to `running`.
    this.stateDetector.onInput(sessionId, data)
    this.events.onUserInput?.(sessionId)
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

  killAllInWorkspace(workspaceId: string): number {
    let killed = 0
    for (const [id, session] of this.sessions) {
      if (session.config.workspaceId === workspaceId) {
        this.kill(id)
        killed += 1
      }
    }
    return killed
  }

  listByWorkspace(workspaceId: string): SessionConfig[] {
    return [...this.sessions.values()]
      .filter((s) => s.config.workspaceId === workspaceId)
      .map((s) => s.config)
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
    this.events.onSessionsChanged?.(this.list())
    return session.config
  }

  // Proxy for Notifier's `onRequestComplete` callback. Notifier doesn't import
  // StateDetector directly (no circular dep); main process injects this method
  // as the callback at construction time. See apps/main/src/index.ts wiring.
  markDone(sessionId: string): void {
    this.stateDetector.markDone(sessionId)
  }

  private resolveCommand(
    type: SessionType,
    label: string | undefined,
    cwd: string,
  ): {
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

    if (type === 'wsl') {
      const wsl = resolveWslCommand(cwd)
      return { command: wsl.command, args: wsl.args, label: label ?? wsl.label }
    }

    if (process.platform === 'win32') {
      const pwsh = findOnPath('pwsh.exe')
      if (pwsh) return { command: pwsh, args: [], label: label ?? 'pwsh' }
      const ps = findOnPath('powershell.exe')
      if (ps) return { command: ps, args: [], label: label ?? 'powershell' }
      return { command: 'cmd.exe', args: [], label: label ?? 'cmd' }
    }
    const shell = process.env['SHELL'] ?? '/bin/bash'
    return { command: shell, args: [], label: label ?? shell.split('/').pop() ?? 'shell' }
  }

  private resolveClaudeBinary(): string | null {
    const exeName = process.platform === 'win32' ? 'claude.exe' : 'claude'
    return findOnPath(exeName) ?? findOnPath('claude')
  }
}
