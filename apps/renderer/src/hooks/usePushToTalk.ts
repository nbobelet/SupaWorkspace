import { useEffect, useRef } from 'react'
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from '@shared/ipc'
import { useSessionStore } from '../state/sessionStore'
import { useVoiceStore } from '../state/voiceStore'
import {
  eventMatchesChord,
  isChordReleaseKey,
  parseChord,
  type ParsedChord,
} from '../lib/keybind-conflict'
import { startCapture, type CaptureHandle } from '../lib/audio-capture'
import { downsampleTo16kMono, float32ToBytes, WHISPER_SAMPLE_RATE } from '../lib/pcm'

/**
 * Wires the global push-to-talk hold-key. Mounted once near the app root.
 *
 * Hold semantics: on key-down matching the configured chord we LOCK the target
 * session to the currently-active one (target_locked_at_keydown) — a focus
 * change mid-utterance cannot redirect the result. We capture mic audio until
 * the chord key (or one of its modifiers) is released, then transcribe via main
 * and STAGE the transcript un-sent through the voice store. Only `claude`
 * sessions are eligible (shell is out of scope for this MVP).
 */
export function usePushToTalk(): void {
  const settingsRef = useRef<VoiceSettings>(DEFAULT_VOICE_SETTINGS)
  const chordRef = useRef<ParsedChord>(parseChord(DEFAULT_VOICE_SETTINGS.pushToTalkKey))
  const handleRef = useRef<CaptureHandle | null>(null)
  const targetRef = useRef<string | null>(null)
  const armingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    void window.ws.settings.get().then((s) => {
      if (cancelled) return
      settingsRef.current = s.voice
      chordRef.current = parseChord(s.voice.pushToTalkKey)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const finishCapture = async (): Promise<void> => {
      const handle = handleRef.current
      const target = targetRef.current
      handleRef.current = null
      targetRef.current = null
      useVoiceStore.getState().stopListening()
      if (!handle || !target) return

      const { pcm, sampleRate } = handle.stop()
      if (pcm.length === 0) return
      const mono16k = downsampleTo16kMono(pcm, sampleRate)
      const bytes = float32ToBytes(mono16k)

      try {
        const res = await window.ws.voice.transcribe({
          sessionId: target,
          pcm: bytes,
          sampleRate: WHISPER_SAMPLE_RATE,
        })
        if (res.status === 'ok') {
          useVoiceStore.getState().setStaged(res.sessionId, res.transcript)
        } else {
          useVoiceStore.getState().setRejected(target, res.reason)
        }
      } catch {
        // Transcription is best-effort: a failed round-trip is a no-op, never a
        // thrown error in the UI.
      }
    }

    const onKeyDown = (e: KeyboardEvent): void => {
      if (!settingsRef.current.enabled || e.repeat) return
      if (armingRef.current || handleRef.current) return
      if (!eventMatchesChord(e, chordRef.current)) return

      const activeId = useSessionStore.getState().activeId
      if (!activeId) return
      const session = useSessionStore.getState().sessions[activeId]
      if (!session || session.type !== 'claude') return

      e.preventDefault()
      armingRef.current = true
      targetRef.current = activeId // locked at key-down
      useVoiceStore.getState().startListening(activeId)

      void startCapture()
        .then((handle) => {
          if (!armingRef.current) {
            // Released before the mic opened — discard immediately.
            handle.stop()
            return
          }
          handleRef.current = handle
        })
        .catch(() => {
          armingRef.current = false
          targetRef.current = null
          useVoiceStore.getState().stopListening()
        })
    }

    const onKeyUp = (e: KeyboardEvent): void => {
      if (!armingRef.current) return
      if (!isChordReleaseKey(e.key, chordRef.current)) return
      armingRef.current = false
      void finishCapture()
    }

    window.addEventListener('keydown', onKeyDown, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [])
}
