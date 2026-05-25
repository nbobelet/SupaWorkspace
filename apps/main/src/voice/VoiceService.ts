import type { SessionConfig } from '@shared/session'
import type { VoiceTranscribeRequest, VoiceTranscribeResponse } from '@shared/ipc'
import type { Transcriber } from './Transcriber'
import { evaluateTranscript } from './transcript-policy'

export interface VoiceServiceDeps {
  transcriber: Transcriber
  /** Returns the live session config for an id, or `undefined` if not live. */
  getSession: (sessionId: string) => SessionConfig | undefined
  /**
   * Structured, PII-free observability sink. Receives event name + numeric
   * fields only — NEVER audio bytes or transcript text. Defaults to a
   * `[voice]`-prefixed console line, matching the rest of main.
   */
  log?: (event: VoiceEvent, fields?: Record<string, number | string>) => void
}

export type VoiceEvent =
  | 'transcript_staged'
  | 'low_confidence_rejected'
  | 'session_not_live_rejected'
  | 'stt_unavailable'
  | 'stt_empty'
  | 'stt_fail'

function defaultLog(event: VoiceEvent, fields?: Record<string, number | string>): void {
  console.log(`[voice] ${event}`, fields ?? {})
}

/**
 * Orchestrates one push-to-talk transcription request end to end:
 *  1. Re-validate the (untrusted) sessionId is a currently-live `claude`
 *     session — reject otherwise, leaking no transcript.
 *  2. Decode the transient PCM bytes to a Float32Array view, transcribe
 *     in-memory, then ZERO the backing buffer (audio_retention_zero).
 *  3. Apply the pure acceptance policy (empty / low-confidence gate).
 *  4. Emit a PII-free observability event for every outcome.
 *
 * Returns a discriminated response — never throws on a misheard/blocked
 * utterance, so the renderer treats rejection as a no-op badge.
 */
export class VoiceService {
  private readonly transcriber: Transcriber
  private readonly getSession: (id: string) => SessionConfig | undefined
  private readonly log: NonNullable<VoiceServiceDeps['log']>

  constructor(deps: VoiceServiceDeps) {
    this.transcriber = deps.transcriber
    this.getSession = deps.getSession
    this.log = deps.log ?? defaultLog
  }

  async handle(req: VoiceTranscribeRequest): Promise<VoiceTranscribeResponse> {
    const session = this.getSession(req.sessionId)
    if (!session || session.type !== 'claude') {
      this.log('session_not_live_rejected')
      return { status: 'rejected', reason: 'session-not-live' }
    }

    if (!this.transcriber.isAvailable()) {
      this.log('stt_unavailable')
      return { status: 'rejected', reason: 'stt-unavailable' }
    }

    // Float32Array VIEW over the transferred bytes — no copy. The PCM byte
    // length is a multiple of 4 in practice (renderer emits float32); guard the
    // remainder so a truncated payload can't construct an out-of-bounds view.
    const usableBytes = req.pcm.byteLength - (req.pcm.byteLength % 4)
    const pcm = new Float32Array(req.pcm.buffer, req.pcm.byteOffset, usableBytes / 4)

    let raw: Awaited<ReturnType<Transcriber['transcribe']>> = null
    try {
      raw = await this.transcriber.transcribe(pcm, req.sampleRate, req.language)
    } catch {
      this.zero(req.pcm)
      this.log('stt_fail')
      return { status: 'rejected', reason: 'stt-unavailable' }
    } finally {
      this.zero(req.pcm)
    }

    if (!raw) {
      this.log('stt_empty')
      return { status: 'rejected', reason: 'empty' }
    }

    const decision = evaluateTranscript(raw)
    if (!decision.accept) {
      const event: VoiceEvent =
        decision.reason === 'low-confidence' ? 'low_confidence_rejected' : 'stt_empty'
      this.log(event, { confidence: Number(decision.confidence.toFixed(3)) })
      return { status: 'rejected', reason: decision.reason, confidence: decision.confidence }
    }

    this.log('transcript_staged', {
      chars: decision.transcript.length,
      confidence: Number(decision.confidence.toFixed(3)),
    })
    return {
      status: 'ok',
      sessionId: req.sessionId,
      transcript: decision.transcript,
      confidence: decision.confidence,
    }
  }

  /** Overwrite the raw audio bytes in place so they do not linger in memory. */
  private zero(pcm: Uint8Array): void {
    pcm.fill(0)
  }
}
