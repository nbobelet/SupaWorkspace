/**
 * Pure PCM helpers for the push-to-talk path. No Web Audio / DOM here so the
 * resampling math is unit-testable in the Node vitest environment.
 */

export const WHISPER_SAMPLE_RATE = 16000

/**
 * Linear-interpolation downsample of mono float32 samples to 16 kHz (the rate
 * whisper expects). Upsampling is not a use case — mics run at 44.1/48 kHz —
 * but the math handles `inputRate <= 16000` by returning a copy unchanged when
 * already at target, avoiding a pointless resample pass.
 */
export function downsampleTo16kMono(input: Float32Array, inputRate: number): Float32Array {
  if (inputRate === WHISPER_SAMPLE_RATE || input.length === 0) {
    return input.slice()
  }
  const ratio = inputRate / WHISPER_SAMPLE_RATE
  const outLength = Math.floor(input.length / ratio)
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const srcPos = i * ratio
    const left = Math.floor(srcPos)
    const right = Math.min(left + 1, input.length - 1)
    const frac = srcPos - left
    out[i] = (input[left] ?? 0) * (1 - frac) + (input[right] ?? 0) * frac
  }
  return out
}

/**
 * Copy float32 samples into a standalone little-endian byte buffer, decoupled
 * from the source's (possibly larger / shared) ArrayBuffer so the value sent
 * over IPC carries no extra audio. Allocating by byte length pins the buffer
 * type to a plain `ArrayBuffer` (not `SharedArrayBuffer`).
 */
export function float32ToBytes(samples: Float32Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(samples.length * 4)
  out.set(new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength))
  return out
}
