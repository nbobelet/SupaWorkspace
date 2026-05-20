import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'packages/shared/src'),
    },
    // Prefer ESM entrypoints when resolving deps under Node — several
    // `@xterm/addon-*` packages advertise a CJS `main` that does not exist
    // on disk (only the `.mjs` build is shipped). `module` is checked
    // before `main`, so vitest picks the file that actually exists.
    mainFields: ['module', 'browser', 'main'],
    conditions: ['import', 'module', 'browser', 'default'],
  },
  test: {
    environment: 'node',
    include: ['packages/**/*.test.{ts,tsx}', 'apps/**/*.test.{ts,tsx}'],
    exclude: ['e2e/**', '**/node_modules/**', 'out/**'],
  },
})
