import { ipcMain } from 'electron'
import { IpcChannel, VoiceTranscribeRequest, type VoiceTranscribeResponse } from '@shared/ipc'
import type { VoiceService } from '../voice/VoiceService'

/**
 * Registers `voice:transcribe`. The handler is the trust boundary: it parses
 * the raw payload with the shared Zod schema (rejecting a malformed pcm/ id at
 * the edge) and delegates the live-session re-check + transcription to
 * `VoiceService`. No transcript ever reaches the PTY here — the renderer stages
 * the returned text un-sent.
 */
export function registerVoiceIpc(opts: { voiceService: VoiceService }): () => void {
  const { voiceService } = opts

  ipcMain.handle(IpcChannel.VoiceTranscribe, async (_, raw): Promise<VoiceTranscribeResponse> => {
    const req = VoiceTranscribeRequest.parse(raw)
    return voiceService.handle(req)
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.VoiceTranscribe)
  }
}
