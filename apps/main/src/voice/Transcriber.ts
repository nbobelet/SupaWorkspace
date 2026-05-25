import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { utilityProcess, type UtilityProcess } from 'electron'
import type { RawTranscript } from './transcript-policy'
import type { VoiceWorkerRequest, VoiceWorkerResponse } from './voice-worker'

/**
 * In-memory speech-to-text boundary. Implementations receive 16 kHz mono PCM
 * float32 samples and return the recognised text + a 0..1 confidence — they
 * NEVER read or write audio files (audio_retention_zero is enforced by the
 * caller, which zeroes the buffer after `transcribe` resolves).
 */
export interface Transcriber {
  /** `null` = the transcript is unusable / engine produced nothing. */
  transcribe(
    pcm: Float32Array,
    sampleRate: number,
    language?: string,
  ): Promise<RawTranscript | null>
  /** Whether the underlying model/binding is actually available on this host. */
  isAvailable(): boolean
}

/**
 * Resolve the whisper model path inside Electron `userData` (NOT the install
 * dir) so it survives app updates and is downloadable separately. Callers pass
 * `app.getPath('userData')`; kept as a param so the module stays testable
 * without importing `electron`.
 */
export function resolveModelPath(userDataDir: string): string {
  return join(userDataDir, 'models', 'ggml-base.bin')
}

/**
 * whisper.cpp-backed transcriber via the `smart-whisper` binding, isolated in an
 * Electron `utilityProcess` (see `voice-worker.ts`) so its native worker threads
 * never run in the main process. The binding + model are OPTIONAL: a missing
 * model short-circuits to `null` here, and the worker reports `unavailable` if
 * the native binding can't load — either way the feature degrades gracefully
 * instead of crashing the app. The utility process is forked lazily on first
 * use and reused; if it dies mid-request the pending promise resolves `null`.
 */
export class WhisperWorkerTranscriber implements Transcriber {
  private readonly modelPath: string
  private readonly workerPath: string
  private child: UtilityProcess | null = null
  private nextId = 1
  private unavailable = false
  private readonly pending = new Map<number, (r: RawTranscript | null) => void>()

  constructor(userDataDir: string, workerPath: string) {
    this.modelPath = resolveModelPath(userDataDir)
    this.workerPath = workerPath
  }

  isAvailable(): boolean {
    return !this.unavailable && existsSync(this.modelPath)
  }

  private resolveAll(value: RawTranscript | null): void {
    for (const resolve of this.pending.values()) resolve(value)
    this.pending.clear()
  }

  private ensureChild(): UtilityProcess {
    if (this.child) return this.child
    // Default stdio (not 'pipe'): whisper.cpp's native model-load/inference
    // chatter would otherwise flood the main console. Failures still surface as
    // 'unavailable'/null messages + the exit-code log below.
    const child = utilityProcess.fork(this.workerPath, [], { serviceName: 'supa-voice-whisper' })
    child.on('message', (msg: VoiceWorkerResponse) => {
      const resolve = this.pending.get(msg.id)
      if (!resolve) return
      this.pending.delete(msg.id)
      if (msg.type === 'unavailable') {
        this.unavailable = true
        resolve(null)
      } else {
        resolve(msg.text === null ? null : { text: msg.text, confidence: msg.confidence })
      }
    })
    // A whisper crash kills only this child; surface it as "no transcript" and
    // allow a fresh fork on the next utterance rather than wedging the feature.
    child.on('exit', (code) => {
      console.error(`[voice] whisper worker exited code=${code}`)
      this.child = null
      this.resolveAll(null)
    })
    this.child = child
    return child
  }

  async transcribe(
    pcm: Float32Array,
    _sampleRate: number,
    language?: string,
  ): Promise<RawTranscript | null> {
    if (!existsSync(this.modelPath)) return null
    const child = this.ensureChild()
    const id = this.nextId++
    // Copy off the (about-to-be-zeroed) IPC buffer; utilityProcess structured-
    // clones the bytes to the child (it only *transfers* MessagePorts, not
    // ArrayBuffers), and a short utterance is a few hundred KB.
    const copy = pcm.slice()
    const req: VoiceWorkerRequest = {
      type: 'transcribe',
      id,
      modelPath: this.modelPath,
      pcm: new Uint8Array(copy.buffer),
      ...(language ? { language } : {}),
    }
    return new Promise<RawTranscript | null>((resolve) => {
      this.pending.set(id, resolve)
      child.postMessage(req)
    })
  }
}

/**
 * Local-testing transcriber that returns canned text without any native binding
 * or model. Gated behind SUPA_VOICE_STUB in index.ts so it never ships — it
 * exists so the capture -> PCM -> policy -> staging -> insert pipeline can be
 * exercised end-to-end on a host that lacks a C++ toolchain to compile whisper.
 */
export class StubTranscriber implements Transcriber {
  isAvailable(): boolean {
    return true
  }

  async transcribe(pcm: Float32Array): Promise<RawTranscript | null> {
    await new Promise((r) => setTimeout(r, 300))
    if (pcm.length === 0) return null
    const seconds = (pcm.length / 16000).toFixed(1)
    return { text: `stub transcript (${seconds}s of audio captured)`, confidence: 0.95 }
  }
}
