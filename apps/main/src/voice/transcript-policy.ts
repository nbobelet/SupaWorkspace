import type { VoiceRejectReason } from '@shared/ipc'

/**
 * Confidence floor below which a transcript is dropped rather than staged. A
 * misheard utterance is worse than no utterance for a terminal — the user
 * should re-speak, not silently get the wrong text near their prompt. Tuned
 * conservatively; surfaced as a named constant so the golden-set tests assert
 * the exact boundary.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5

export interface RawTranscript {
  text: string
  confidence: number
}

export type TranscriptDecision =
  | { accept: true; transcript: string; confidence: number }
  | {
      accept: false
      reason: Extract<VoiceRejectReason, 'empty' | 'low-confidence'>
      confidence: number
    }

/**
 * Pure acceptance gate, decoupled from STT and IPC so it is exhaustively
 * testable against a golden set. Order matters: an empty/whitespace transcript
 * is `empty` regardless of the (often spurious) confidence the engine reports
 * for silence; only non-empty text is confidence-gated.
 */
export function evaluateTranscript(raw: RawTranscript): TranscriptDecision {
  const trimmed = raw.text.trim()
  if (trimmed.length === 0) {
    return { accept: false, reason: 'empty', confidence: raw.confidence }
  }
  if (raw.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return { accept: false, reason: 'low-confidence', confidence: raw.confidence }
  }
  return { accept: true, transcript: trimmed, confidence: raw.confidence }
}
