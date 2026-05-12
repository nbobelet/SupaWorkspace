import { ipcMain } from 'electron'
import { IpcChannel } from '@shared/ipc'
import {
  CmdGuardSetRulesRequest,
  CmdGuardAppendAuditRequest,
  type CmdGuardGetResponse,
} from '@shared/cmdGuard'
import type { CmdGuardStore } from '../cmd-guard/CmdGuardStore'

export function registerCmdGuardIpc(opts: { cmdGuardStore: CmdGuardStore }): () => void {
  const { cmdGuardStore } = opts

  ipcMain.handle(IpcChannel.CmdGuardGet, async (): Promise<CmdGuardGetResponse> => {
    return { rules: cmdGuardStore.getRules(), audit: cmdGuardStore.getAudit() }
  })

  ipcMain.handle(IpcChannel.CmdGuardSetRules, async (_, raw): Promise<void> => {
    const req = CmdGuardSetRulesRequest.parse(raw)
    cmdGuardStore.setRules(req.rules)
  })

  ipcMain.handle(IpcChannel.CmdGuardAppendAudit, async (_, raw): Promise<CmdGuardGetResponse> => {
    const req = CmdGuardAppendAuditRequest.parse(raw)
    cmdGuardStore.appendAudit(req)
    return { rules: cmdGuardStore.getRules(), audit: cmdGuardStore.getAudit() }
  })

  return () => {
    ipcMain.removeHandler(IpcChannel.CmdGuardGet)
    ipcMain.removeHandler(IpcChannel.CmdGuardSetRules)
    ipcMain.removeHandler(IpcChannel.CmdGuardAppendAudit)
  }
}
