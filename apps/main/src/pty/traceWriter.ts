import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'

interface TraceChunk {
  delayMs: number
  hex: string
}

export interface TraceWriter {
  write(data: string): void
  close(): void
}

// Hard cap to keep long sessions from blowing memory. A typical claude turn
// fits under 1000 chunks; 5000 covers an extended back-and-forth without
// truncating realistic repro material.
const MAX_CHUNKS = 5000

// Flush cadence — write the whole array to disk every N chunks AND every
// M ms (whichever comes first), so a crash, an unkilled session, or a
// quit-without-exit still leaves a usable trace on disk.
const FLUSH_EVERY_CHUNKS = 25
const FLUSH_EVERY_MS = 2000

function isEnabled(): boolean {
  const v = process.env['SUPATTY_TRACE_PTY']
  return v === '1' || v === 'true' || v === 'yes' || v === 'on'
}

let bannerLogged = false
function logBannerOnce(): void {
  if (bannerLogged) return
  bannerLogged = true
  const dir = join(app.getPath('userData'), 'pty-traces')
  console.log(`[supat:trace] enabled (SUPATTY_TRACE_PTY) -> ${dir}`)
}

// Captures raw PTY chunks into a JSON file that is wire-compatible with the
// existing replay fixtures under apps/main/test/fixtures/pty/. Format:
//   [ {"delayMs": 0, "hex": "..."}, {"delayMs": 12, "hex": "..."}, ... ]
// Flushed to disk incrementally so a quit-without-exit (the common path —
// user closes the app, PTY never receives an explicit kill) still leaves
// a usable file. Move a captured trace into the fixtures dir to unlock
// a deterministic replay test in stateDetector.test.ts.
export function createTraceWriter(sessionId: string, type: string): TraceWriter | null {
  if (!isEnabled()) return null
  logBannerOnce()

  const chunks: TraceChunk[] = []
  let lastWriteAt = 0
  let closed = false
  let truncated = false
  let dirty = false
  let flushTimer: ReturnType<typeof setInterval> | null = null
  let fullPath: string | null = null

  function resolvePath(): string {
    if (fullPath) return fullPath
    const dir = join(app.getPath('userData'), 'pty-traces')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    fullPath = join(dir, `${type}-${sessionId.slice(0, 8)}-${stamp}.json`)
    return fullPath
  }

  function flush(reason: string): void {
    if (!dirty) return
    dirty = false
    try {
      const p = resolvePath()
      writeFileSync(p, JSON.stringify(chunks, null, 2))
      console.log(
        `[supat:trace] flush(${reason}) ${chunks.length} chunk(s) -> ${p}${truncated ? ' (truncated)' : ''}`,
      )
    } catch (err) {
      console.warn('[supat:trace] write failed', err)
    }
  }

  flushTimer = setInterval(() => flush('timer'), FLUSH_EVERY_MS)
  // Don't keep the event loop alive just for the flush timer.
  flushTimer.unref?.()

  return {
    write(data: string) {
      if (closed) return
      if (chunks.length >= MAX_CHUNKS) {
        if (!truncated) {
          truncated = true
          console.warn(
            `[supat:trace] ${sessionId} exceeded ${MAX_CHUNKS} chunks — further data dropped`,
          )
          flush('cap')
        }
        return
      }
      const now = Date.now()
      const delayMs = chunks.length === 0 ? 0 : now - lastWriteAt
      lastWriteAt = now
      chunks.push({
        delayMs,
        hex: Buffer.from(data, 'utf8').toString('hex'),
      })
      dirty = true
      if (chunks.length === 1) flush('first-chunk')
      else if (chunks.length % FLUSH_EVERY_CHUNKS === 0) flush('count')
    },
    close() {
      if (closed) return
      closed = true
      if (flushTimer) {
        clearInterval(flushTimer)
        flushTimer = null
      }
      if (chunks.length === 0) {
        console.log(`[supat:trace] ${sessionId} closed with 0 chunks — no file written`)
        return
      }
      flush('close')
    },
  }
}
