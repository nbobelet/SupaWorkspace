import { useEffect, useState, type ReactElement } from 'react'

export function App(): ReactElement {
  const [bridgeReady, setBridgeReady] = useState(false)

  useEffect(() => {
    setBridgeReady(typeof window !== 'undefined' && 'ws' in window)
  }, [])

  return (
    <main className="grid min-h-screen place-items-center bg-bg text-fg">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">ClaudeWorkspace</h1>
        <p className="text-muted">Multi-session terminal workspace manager</p>
        <p className="text-sm text-muted">
          IPC bridge: <span className={bridgeReady ? 'text-accent' : 'text-warn'}>{bridgeReady ? 'connected' : 'unavailable'}</span>
        </p>
      </div>
    </main>
  )
}
