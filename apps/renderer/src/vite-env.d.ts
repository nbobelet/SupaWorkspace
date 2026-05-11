/// <reference types="vite/client" />

import type { SupaWorkspaceApi } from '../../preload/src/index'

declare global {
  interface Window {
    ws: SupaWorkspaceApi
  }
}

export {}
