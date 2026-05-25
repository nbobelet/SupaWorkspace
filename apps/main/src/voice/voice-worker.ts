/**
 * Runs in an Electron `utilityProcess` — NOT the main process. smart-whisper's
 * native worker threads fast-fail (0xC0000409) when spun up inside the main
 * process's V8/Chromium/libuv environment; isolating them in a utility process
 * keeps a whisper crash from taking down the app. One `Whisper` instance is
 * loaded lazily per model path and reused across requests.
 *
 * Protocol (main <-> worker), one request id per utterance:
 *   main  -> worker: { type: 'transcribe', id, modelPath, language?, pcm }
 *   worker -> main : { type: 'result', id, text, confidence } | { text: null }
 *                  | { type: 'unavailable', id }   (binding/model not loadable)
 */

interface WhisperSegment {
  text: string
  confidence?: number
}
interface WhisperInstance {
  transcribe: (
    pcm: Float32Array,
    opts?: { language?: string; format?: 'simple' | 'detail' },
  ) => Promise<{ result: Promise<WhisperSegment[]> }>
  free: () => Promise<void>
}
interface SmartWhisperModule {
  Whisper: new (modelPath: string, config?: { gpu?: boolean; offload?: number }) => WhisperInstance
}

export interface VoiceWorkerRequest {
  type: 'transcribe'
  id: number
  modelPath: string
  language?: string
  pcm: Uint8Array
}
export type VoiceWorkerResponse =
  | { type: 'result'; id: number; text: string; confidence: number }
  | { type: 'result'; id: number; text: null }
  | { type: 'unavailable'; id: number }

let whisper: WhisperInstance | null = null
let loadedPath: string | null = null

async function getWhisper(modelPath: string): Promise<WhisperInstance | null> {
  if (whisper && loadedPath === modelPath) return whisper
  try {
    const mod = (await import('smart-whisper' as string)) as SmartWhisperModule
    // CPU-only: the GPU path fast-fails on hosts without a viable whisper.cpp
    // GPU backend, and a short local utterance does not need it.
    whisper = new mod.Whisper(modelPath, { gpu: false })
    loadedPath = modelPath
    return whisper
  } catch (e) {
    console.error('[voice-worker] whisper load failed:', e)
    return null
  }
}

const port = process.parentPort

async function handle(msg: VoiceWorkerRequest): Promise<void> {
  const reply = (res: VoiceWorkerResponse): void => port.postMessage(res)
  const w = await getWhisper(msg.modelPath)
  if (!w) {
    reply({ type: 'unavailable', id: msg.id })
    return
  }
  try {
    const pcm = new Float32Array(
      msg.pcm.buffer,
      msg.pcm.byteOffset,
      Math.floor(msg.pcm.byteLength / 4),
    )
    const task = await w.transcribe(pcm, {
      format: 'detail',
      ...(msg.language ? { language: msg.language } : {}),
    })
    const segments = await task.result
    const text = segments
      .map((s) => s.text)
      .join(' ')
      .trim()
    if (text.length === 0) {
      reply({ type: 'result', id: msg.id, text: null })
      return
    }
    const confs = segments
      .map((s) => s.confidence)
      .filter((c): c is number => typeof c === 'number')
    const confidence = confs.length > 0 ? confs.reduce((a, b) => a + b, 0) / confs.length : 0.8
    reply({ type: 'result', id: msg.id, text, confidence: Math.max(0, Math.min(1, confidence)) })
  } catch (e) {
    console.error('[voice-worker] transcribe failed:', e)
    reply({ type: 'result', id: msg.id, text: null })
  }
}

port.on('message', (e: { data: VoiceWorkerRequest }) => {
  if (e.data?.type === 'transcribe') void handle(e.data)
})
