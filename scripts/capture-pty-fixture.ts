// Capture raw PTY output from a spawned command into a fixture pair
// (`<out>.bin` raw bytes + `<out>.json` chunk-with-delay list). Use this
// to record real-world bytes for stateDetector regression tests when the
// hand-authored synthetic fixtures stop being representative.
//
// Usage:
//   bun scripts/capture-pty-fixture.ts \
//     --cmd "pwsh -NoLogo -Command 'sleep 3; exit'" \
//     --out apps/main/test/fixtures/pty/pwsh-sleep-3
//
// Flags:
//   --cmd <string>   Quoted shell command to spawn. Required.
//   --out <prefix>   Output path prefix (no extension). Required.
//                    Writes <prefix>.bin (raw concat) + <prefix>.json
//                    ([{delayMs, hex}, ...]).
//   --cols <n>       Terminal cols (default 80).
//   --rows <n>       Terminal rows (default 24).
//   --idle <ms>      Stop recording after this idle gap (default 4000).
//
// Notes:
//   - Run from the repo root so output paths resolve correctly.
//   - Run AFTER the process under capture has settled (Ctrl+C to stop
//     earlier if --idle is too long for your case).

import { spawn as ptySpawn } from '@homebridge/node-pty-prebuilt-multiarch'
import { writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { mkdirSync } from 'node:fs'

interface Chunk {
  delayMs: number
  hex: string
}

interface Args {
  cmd: string
  out: string
  cols: number
  rows: number
  idle: number
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = { cols: 80, rows: 24, idle: 4000 }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    if (!flag || !value) continue
    if (flag === '--cmd') args.cmd = value
    else if (flag === '--out') args.out = value
    else if (flag === '--cols') args.cols = Number(value)
    else if (flag === '--rows') args.rows = Number(value)
    else if (flag === '--idle') args.idle = Number(value)
    else continue
    i += 1
  }
  if (!args.cmd || !args.out) {
    throw new Error('Usage: bun scripts/capture-pty-fixture.ts --cmd "<cmd>" --out <prefix>')
  }
  return args as Args
}

function splitCommand(cmdLine: string): { command: string; args: string[] } {
  const parts: string[] = []
  let current = ''
  let inQuote: string | null = null
  for (const ch of cmdLine) {
    if (inQuote) {
      if (ch === inQuote) inQuote = null
      else current += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      continue
    }
    if (ch === ' ') {
      if (current) parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  if (current) parts.push(current)
  const [command, ...rest] = parts
  if (!command) throw new Error('Empty command')
  return { command, args: rest }
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const { command, args: cmdArgs } = splitCommand(args.cmd)

  const chunks: Chunk[] = []
  const rawParts: Buffer[] = []
  let lastEventAt = Date.now()
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const pty = ptySpawn(command, cmdArgs, {
    name: 'xterm-256color',
    cols: args.cols,
    rows: args.rows,
    cwd: process.cwd(),
    env: process.env as Record<string, string>,
  })

  const finish = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    mkdirSync(dirname(args.out), { recursive: true })
    const bin = Buffer.concat(rawParts)
    writeFileSync(`${args.out}.bin`, bin)
    writeFileSync(`${args.out}.json`, `${JSON.stringify(chunks, null, 2)}\n`)
    console.log(`[capture] wrote ${args.out}.bin (${bin.length} bytes) + ${args.out}.json (${chunks.length} chunks)`)
    try {
      pty.kill()
    } catch {
      /* ignore */
    }
    process.exit(0)
  }

  const armIdleTimer = (): void => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(finish, args.idle)
  }

  pty.onData((data) => {
    const now = Date.now()
    const delayMs = now - lastEventAt
    lastEventAt = now
    const buf = Buffer.from(data, 'utf8')
    rawParts.push(buf)
    chunks.push({ delayMs, hex: buf.toString('hex') })
    armIdleTimer()
  })

  pty.onExit(() => finish())

  armIdleTimer()
  process.stdin.on('data', (b) => pty.write(b.toString('utf8')))
}

main()
