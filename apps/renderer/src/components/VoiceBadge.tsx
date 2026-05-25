import { useEffect, type ReactElement } from 'react'
import { useVoiceStore } from '../state/voiceStore'

const REJECT_LABEL: Record<string, string> = {
  'session-not-live': 'session gone',
  'low-confidence': 'unclear — retry',
  empty: 'nothing heard',
  'stt-unavailable': 'voice model missing',
}

/**
 * Listening / rejection indicator for a single pane header. Shows a pulsing
 * "listening" pill for the session locked at key-down, or a transient rejection
 * note. Animation is `motion-safe:` only — `prefers-reduced-motion` users get
 * the static pill. Token-driven colors, no hardcoded hex.
 */
export function VoiceBadge({ sessionId }: { sessionId: string }): ReactElement | null {
  const listening = useVoiceStore((s) => s.listeningSessionId === sessionId)
  const transcribing = useVoiceStore((s) => s.transcribingSessionId === sessionId)
  const rejected = useVoiceStore((s) => s.rejected[sessionId])
  const clearRejected = useVoiceStore((s) => s.clearRejected)

  useEffect(() => {
    if (!rejected) return
    const t = window.setTimeout(() => clearRejected(sessionId), 2500)
    return () => window.clearTimeout(t)
  }, [rejected, sessionId, clearRejected])

  if (listening) {
    return (
      <span
        aria-live="assertive"
        aria-label="listening for voice input"
        className="flex items-center gap-1 rounded-full bg-running/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-running"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-running motion-safe:animate-pulse" />
        listening
      </span>
    )
  }

  if (transcribing) {
    return (
      <span
        aria-live="assertive"
        aria-label="transcribing voice input"
        className="flex items-center gap-1 rounded-full bg-accent/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-accent"
      >
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent motion-safe:animate-pulse" />
        transcribing…
      </span>
    )
  }

  if (rejected) {
    return (
      <span
        aria-live="polite"
        className="rounded-full bg-warn/20 px-2 py-0.5 text-[10px] uppercase tracking-wider text-warn"
      >
        {REJECT_LABEL[rejected] ?? 'voice failed'}
      </span>
    )
  }

  return null
}
