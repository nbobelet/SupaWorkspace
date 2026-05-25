import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IpcChannel } from '@shared/ipc'

type Handler = (event: unknown, raw: unknown) => unknown
const handlers = new Map<string, Handler>()

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: Handler) => handlers.set(channel, fn),
    removeHandler: (channel: string) => handlers.delete(channel),
  },
}))

const SESSION_ID = '550e8400-e29b-41d4-a716-446655440000'

function pcmBytes(samples: number[]): Uint8Array<ArrayBuffer> {
  const f = new Float32Array(samples)
  const out = new Uint8Array(f.length * 4)
  out.set(new Uint8Array(f.buffer))
  return out
}

beforeEach(() => handlers.clear())

describe('voice IPC — boundary validation + delegation', () => {
  it('parses the payload with the Zod schema and delegates to VoiceService', async () => {
    const { registerVoiceIpc } = await import('./voice')
    const handle = vi.fn(async () => ({
      status: 'ok' as const,
      sessionId: SESSION_ID,
      transcript: 'hello',
      confidence: 0.9,
    }))
    registerVoiceIpc({ voiceService: { handle } as never })

    const req = { sessionId: SESSION_ID, pcm: pcmBytes([0.1, 0.2]), sampleRate: 16000 }
    const res = await handlers.get(IpcChannel.VoiceTranscribe)?.({}, req)

    expect(handle).toHaveBeenCalledTimes(1)
    expect(res).toMatchObject({ status: 'ok', transcript: 'hello' })
  })

  it('rejects a malformed payload at the edge (bad sessionId), without calling the service', async () => {
    const { registerVoiceIpc } = await import('./voice')
    const handle = vi.fn()
    registerVoiceIpc({ voiceService: { handle } as never })

    await expect(
      handlers.get(IpcChannel.VoiceTranscribe)?.(
        {},
        {
          sessionId: 'not-a-uuid',
          pcm: pcmBytes([0.1]),
          sampleRate: 16000,
        },
      ),
    ).rejects.toThrow()
    expect(handle).not.toHaveBeenCalled()
  })

  it('rejects a payload whose pcm is not a Uint8Array', async () => {
    const { registerVoiceIpc } = await import('./voice')
    const handle = vi.fn()
    registerVoiceIpc({ voiceService: { handle } as never })

    await expect(
      handlers.get(IpcChannel.VoiceTranscribe)?.(
        {},
        {
          sessionId: SESSION_ID,
          pcm: [0.1, 0.2],
          sampleRate: 16000,
        },
      ),
    ).rejects.toThrow()
    expect(handle).not.toHaveBeenCalled()
  })
})
