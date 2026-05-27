import { useEffect, useState } from 'react'
import type { CapabilitiesResponse } from '@shared/ipc'

// Capabilities are host-static for the process lifetime, so probe once and
// share the resolved value across every consumer.
let cache: CapabilitiesResponse | null = null
let inflight: Promise<CapabilitiesResponse> | null = null

function load(): Promise<CapabilitiesResponse> {
  if (cache) return Promise.resolve(cache)
  if (!inflight) {
    inflight = window.ws.capabilities.get().then((caps) => {
      cache = caps
      return caps
    })
  }
  return inflight
}

export function useCapabilities(): CapabilitiesResponse {
  const [caps, setCaps] = useState<CapabilitiesResponse>(cache ?? { wsl: false })

  useEffect(() => {
    let alive = true
    void load().then((resolved) => {
      if (alive) setCaps(resolved)
    })
    return () => {
      alive = false
    }
  }, [])

  return caps
}
