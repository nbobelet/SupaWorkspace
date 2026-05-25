import { describe, expect, it } from 'vitest'
import { downsampleTo16kMono, float32ToBytes, WHISPER_SAMPLE_RATE } from './pcm'

describe('downsampleTo16kMono', () => {
  it('returns an independent copy unchanged when already at 16 kHz', () => {
    // float32-exact values so the round-trip is bit-identical.
    const input = new Float32Array([0.5, 0.25, -0.75])
    const out = downsampleTo16kMono(input, WHISPER_SAMPLE_RATE)
    expect(Array.from(out)).toEqual([0.5, 0.25, -0.75])
    out[0] = 9 // mutate the copy
    expect(input[0]).toBe(0.5) // source untouched
  })

  it('reduces length by the rate ratio (48k → 16k ≈ /3)', () => {
    const input = new Float32Array(48_000).fill(0.5)
    const out = downsampleTo16kMono(input, 48_000)
    expect(out.length).toBe(16_000)
  })

  it('44.1k → 16k shrinks proportionally', () => {
    const input = new Float32Array(44_100)
    const out = downsampleTo16kMono(input, 44_100)
    expect(out.length).toBe(Math.floor(44_100 / (44_100 / 16_000)))
  })

  it('handles an empty input', () => {
    expect(downsampleTo16kMono(new Float32Array(0), 48_000).length).toBe(0)
  })
})

describe('float32ToBytes', () => {
  it('produces a standalone 4-bytes-per-sample buffer', () => {
    const samples = new Float32Array([1, -1, 0.5])
    const bytes = float32ToBytes(samples)
    expect(bytes.byteLength).toBe(samples.length * 4)
    // round-trips back to the same floats
    const round = new Float32Array(bytes.buffer)
    expect(Array.from(round)).toEqual([1, -1, 0.5])
  })

  it('does not share the source ArrayBuffer', () => {
    const samples = new Float32Array([0.25])
    const bytes = float32ToBytes(samples)
    bytes[0] = 255
    expect(samples[0]).toBe(0.25)
  })
})
