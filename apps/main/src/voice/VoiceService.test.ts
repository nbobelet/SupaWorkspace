import { describe, expect, it, vi } from 'vitest'
import type { SessionConfig } from '@shared/session'
import type { VoiceTranscribeRequest } from '@shared/ipc'
import { VoiceService } from './VoiceService'
import type { Transcriber } from './Transcriber'
import type { RawTranscript } from './transcript-policy'

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000'

function claudeSession(): SessionConfig {
  return {
    id: SESSION_ID,
    workspaceId: '550e8400-e29b-41d4-a716-446655440001',
    type: 'claude',
    label: 'claude',
    cwd: '/tmp',
    createdAt: 0,
  }
}

function pcmBytes(samples: number[]): Uint8Array<ArrayBuffer> {
  const f = new Float32Array(samples)
  const out = new Uint8Array(f.length * 4)
  out.set(new Uint8Array(f.buffer))
  return out
}

function makeRequest(overrides?: Partial<VoiceTranscribeRequest>): VoiceTranscribeRequest {
  return {
    sessionId: SESSION_ID,
    pcm: pcmBytes([0.1, 0.2, 0.3, 0.4]),
    sampleRate: 16000,
    ...overrides,
  }
}

function transcriber(result: RawTranscript | null, available = true): Transcriber {
  return {
    isAvailable: () => available,
    transcribe: vi.fn(async () => result),
  }
}

describe('VoiceService — untrusted sessionId validation', () => {
  it('rejects when the session is not live (getSession → undefined), without transcribing', async () => {
    const t = transcriber({ text: 'hi', confidence: 0.9 })
    const svc = new VoiceService({ transcriber: t, getSession: () => undefined, log: vi.fn() })

    const res = await svc.handle(makeRequest())

    expect(res).toEqual({ status: 'rejected', reason: 'session-not-live' })
    expect(t.transcribe).not.toHaveBeenCalled()
  })

  it('rejects a live SHELL session — claude pane only (out of scope: shell)', async () => {
    const t = transcriber({ text: 'hi', confidence: 0.9 })
    const shell: SessionConfig = { ...claudeSession(), type: 'shell' }
    const svc = new VoiceService({ transcriber: t, getSession: () => shell, log: vi.fn() })

    const res = await svc.handle(makeRequest())

    expect(res).toEqual({ status: 'rejected', reason: 'session-not-live' })
    expect(t.transcribe).not.toHaveBeenCalled()
  })
})

describe('VoiceService — transcription outcomes', () => {
  it('returns the staged transcript on the ok path', async () => {
    const t = transcriber({ text: '  run the tests  ', confidence: 0.9 })
    const svc = new VoiceService({ transcriber: t, getSession: claudeSession, log: vi.fn() })

    const res = await svc.handle(makeRequest())

    expect(res).toEqual({
      status: 'ok',
      sessionId: SESSION_ID,
      transcript: 'run the tests',
      confidence: 0.9,
    })
  })

  it('rejects low-confidence transcripts', async () => {
    const t = transcriber({ text: 'maybe this', confidence: 0.2 })
    const svc = new VoiceService({ transcriber: t, getSession: claudeSession, log: vi.fn() })

    const res = await svc.handle(makeRequest())

    expect(res.status).toBe('rejected')
    if (res.status === 'rejected') expect(res.reason).toBe('low-confidence')
  })

  it('rejects when STT is unavailable (model/binding missing)', async () => {
    const t = transcriber(null, false)
    const svc = new VoiceService({ transcriber: t, getSession: claudeSession, log: vi.fn() })

    const res = await svc.handle(makeRequest())

    expect(res).toEqual({ status: 'rejected', reason: 'stt-unavailable' })
    expect(t.transcribe).not.toHaveBeenCalled()
  })

  it('rejects as empty when the engine returns nothing', async () => {
    const t = transcriber(null, true)
    const svc = new VoiceService({ transcriber: t, getSession: claudeSession, log: vi.fn() })

    const res = await svc.handle(makeRequest())

    expect(res).toEqual({ status: 'rejected', reason: 'empty' })
  })
})

describe('VoiceService — audio_retention_zero', () => {
  it('zeroes the raw audio bytes after a successful transcription', async () => {
    const t = transcriber({ text: 'hello', confidence: 0.9 })
    const svc = new VoiceService({ transcriber: t, getSession: claudeSession, log: vi.fn() })
    const req = makeRequest()

    await svc.handle(req)

    expect([...req.pcm].every((b) => b === 0)).toBe(true)
  })

  it('zeroes the buffer even when the transcriber throws', async () => {
    const t: Transcriber = {
      isAvailable: () => true,
      transcribe: vi.fn(async () => {
        throw new Error('engine crash')
      }),
    }
    const svc = new VoiceService({ transcriber: t, getSession: claudeSession, log: vi.fn() })
    const req = makeRequest()

    const res = await svc.handle(req)

    expect(res.status).toBe('rejected')
    expect([...req.pcm].every((b) => b === 0)).toBe(true)
  })
})
