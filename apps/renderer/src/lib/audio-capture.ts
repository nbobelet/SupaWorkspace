/**
 * Microphone capture for push-to-talk. Captures raw mono float32 PCM via the
 * Web Audio graph (NOT MediaRecorder) so no encoded blob and no file ever
 * exists — the samples live only in memory and are handed straight to the
 * downsampler. The caller stops the handle on key-up to get the buffer.
 *
 * Uses `ScriptProcessorNode`: deprecated in favour of AudioWorklet, but a
 * worklet needs a separately-bundled module file; for a single short utterance
 * the script processor is adequate and keeps the feature self-contained. Marked
 * for future migration in the how-to doc.
 */

export interface CaptureHandle {
  /** Stop capture, release the mic, and return the concatenated mono samples. */
  stop: () => { pcm: Float32Array; sampleRate: number }
}

export async function startCapture(): Promise<CaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const AudioCtor: typeof AudioContext =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new AudioCtor()
  const source = ctx.createMediaStreamSource(stream)
  const processor = ctx.createScriptProcessor(4096, 1, 1)
  const chunks: Float32Array[] = []

  processor.onaudioprocess = (event: AudioProcessingEvent): void => {
    const channel = event.inputBuffer.getChannelData(0)
    chunks.push(new Float32Array(channel))
  }

  source.connect(processor)
  processor.connect(ctx.destination)

  return {
    stop: () => {
      processor.disconnect()
      source.disconnect()
      for (const track of stream.getTracks()) track.stop()
      const sampleRate = ctx.sampleRate
      void ctx.close()

      const total = chunks.reduce((sum, c) => sum + c.length, 0)
      const pcm = new Float32Array(total)
      let offset = 0
      for (const c of chunks) {
        pcm.set(c, offset)
        offset += c.length
      }
      chunks.length = 0
      return { pcm, sampleRate }
    },
  }
}
