/// <reference types="vite/client" />

import type { ClaudeWorkspaceApi } from '../../preload/src/index'

declare global {
  interface Window {
    ws: ClaudeWorkspaceApi
  }
}

export {}
