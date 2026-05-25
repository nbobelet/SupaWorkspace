import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { RawTranscript } from './transcript-policy'

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

// Minimal structural type for the optional `smart-whisper` binding. Declared
// locally (instead of `import type 'smart-whisper'`) so `tsc` does not require
// the optional native dependency to be installed for typecheck to pass.
interface WhisperSegment {
  text: string
  confidence?: number
}
interface WhisperInstance {
  transcribe: (
    pcm: Float32Array,
    opts?: { language?: string },
  ) => { result: Promise<WhisperSegment[]> }
  free: () => Promise<void>
}
interface SmartWhisperModule {
  Whisper: new (modelPath: string) => WhisperInstance
}

/**
 * whisper.cpp-backed transcriber via the in-memory `smart-whisper` binding
 * (Float32Array in → segments out, no temp WAV). The binding is an
 * OPTIONAL dependency loaded lazily and guarded: if it is not installed, or the
 * model is missing from userData, the transcriber reports unavailable and the
 * feature degrades gracefully rather than crashing the main process.
 */
export class WhisperTranscriber implements Transcriber {
  private readonly modelPath: string
  private loaded: WhisperInstance | null = null
  private bindingMissing = false

  constructor(userDataDir: string) {
    this.modelPath = resolveModelPath(userDataDir)
  }

  isAvailable(): boolean {
    return !this.bindingMissing && existsSync(this.modelPath)
  }

  private async load(): Promise<WhisperInstance | null> {
    if (this.loaded) return this.loaded
    if (this.bindingMissing || !existsSync(this.modelPath)) return null
    try {
      // Specifier cast to `string` keeps tsc from resolving (and requiring) the
      // optional module at build time; it is a real runtime import when present.
      const mod = (await import('smart-whisper' as string)) as SmartWhisperModule
      this.loaded = new mod.Whisper(this.modelPath)
      return this.loaded
    } catch {
      this.bindingMissing = true
      return null
    }
  }

  async transcribe(
    pcm: Float32Array,
    _sampleRate: number,
    language?: string,
  ): Promise<RawTranscript | null> {
    const whisper = await this.load()
    if (!whisper) return null
    try {
      const task = whisper.transcribe(pcm, language ? { language } : undefined)
      const segments = await task.result
      const text = segments
        .map((s) => s.text)
        .join(' ')
        .trim()
      if (text.length === 0) return null
      // Average the per-segment confidence when the binding reports it; default
      // to a neutral-pass value otherwise so the policy gate stays meaningful.
      const confs = segments
        .map((s) => s.confidence)
        .filter((c): c is number => typeof c === 'number')
      const confidence = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.8
      return { text, confidence: Math.max(0, Math.min(1, confidence)) }
    } catch {
      return null
    }
  }
}
