import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { evaluateTranscript, LOW_CONFIDENCE_THRESHOLD } from './transcript-policy'

interface GoldenCase {
  name: string
  input: { text: string; confidence: number }
  expect:
    | { accept: true; transcript: string }
    | { accept: false; reason: 'empty' | 'low-confidence' }
}

const GOLDEN: GoldenCase[] = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'test', 'fixtures', 'voice', 'golden.json'), 'utf8'),
) as GoldenCase[]

describe('evaluateTranscript — golden set (FR/EN, noisy, truncated)', () => {
  for (const c of GOLDEN) {
    it(`${c.name} → ${c.expect.accept ? 'accept' : `reject:${c.expect.reason}`}`, () => {
      const decision = evaluateTranscript(c.input)
      expect(decision.accept).toBe(c.expect.accept)
      if (c.expect.accept && decision.accept) {
        expect(decision.transcript).toBe(c.expect.transcript)
      } else if (!c.expect.accept && !decision.accept) {
        expect(decision.reason).toBe(c.expect.reason)
      }
    })
  }
})

describe('evaluateTranscript — boundary + ordering', () => {
  it('accepts exactly at the threshold', () => {
    expect(evaluateTranscript({ text: 'go', confidence: LOW_CONFIDENCE_THRESHOLD }).accept).toBe(
      true,
    )
  })

  it('rejects just below the threshold', () => {
    const d = evaluateTranscript({ text: 'go', confidence: LOW_CONFIDENCE_THRESHOLD - 0.001 })
    expect(d.accept).toBe(false)
    if (!d.accept) expect(d.reason).toBe('low-confidence')
  })

  it('empty text is "empty" even with perfect confidence (order: empty before confidence)', () => {
    const d = evaluateTranscript({ text: '   ', confidence: 1 })
    expect(d.accept).toBe(false)
    if (!d.accept) expect(d.reason).toBe('empty')
  })
})
