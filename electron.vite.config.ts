import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const sharedAlias = {
  '@shared': resolve(__dirname, 'packages/shared/src'),
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: resolve(__dirname, 'apps/main/src/index.ts'),
        external: ['node-pty', 'electron-store'],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: resolve(__dirname, 'apps/preload/src/index.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'apps/renderer'),
    resolve: { alias: sharedAlias },
    plugins: [react(), tailwindcss()],
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: resolve(__dirname, 'apps/renderer/index.html'),
      },
    },
    server: {
      port: 5173,
    },
  },
})
