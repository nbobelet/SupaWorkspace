import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const ROOT = resolve(__dirname, '..')
const MAIN_ENTRY = join(ROOT, 'out', 'main', 'index.js')

let app: ElectronApplication
let page: Page
let userDataDir: string
let workspaceDir: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-theme-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-theme-workspace-'))
  writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# theme workspace\n', 'utf8')

  const seed = {
    workspaces: [
      {
        id: randomUUID(),
        name: 'theme-workspace',
        rootPath: workspaceDir,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        permissions: { extraPaths: [], allow: [], deny: [] },
      },
    ],
  }
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, 'workspaces.json'), JSON.stringify(seed), 'utf8')

  app = await electron.launch({
    args: [MAIN_ENTRY, `--user-data-dir=${userDataDir}`],
    env: {
      ...process.env,
      NODE_ENV: 'production',
    },
  })
  page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
})

test.afterAll(async () => {
  await app?.close()
  try {
    rmSync(userDataDir, { recursive: true, force: true })
    rmSync(workspaceDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})

test('theme: changing --color-bg re-themes terminal without remount', async () => {
  await expect(page.getByText('theme-workspace').first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'New shell session' }).first().click()

  const xtermScreen = page.locator('.xterm-screen').first()
  await expect(xtermScreen).toBeVisible({ timeout: 10_000 })

  // Capture the active session's data-session-id BEFORE the theme swap.
  const sessionIdBefore = await page.evaluate(() => {
    const el = document.querySelector('[data-session-id]') as HTMLElement | null
    return el?.dataset['sessionId'] ?? null
  })
  expect(sessionIdBefore).toBeTruthy()

  // Read the xterm Terminal's `options.theme.background` via the debug
  // surface installed by `useTerminalSession`. This is the source of truth
  // for whether the live theme actually re-bound — independent of WebGL vs
  // DOM renderer painting.
  const bgBefore = await page.evaluate((id) => {
    const win = window as unknown as { __readTerminalThemeBg?: (sid: string) => string | null }
    return id ? (win.__readTerminalThemeBg?.(id) ?? null) : null
  }, sessionIdBefore)

  // Programmatically swap a CSS token — this mutates the inline style on
  // documentElement, which fires the MutationObserver in useDesignTokens
  // and triggers the re-theme effect.
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--color-bg', '#112233')
  })

  // Give React a frame to flush its useEffect on `tokens`.
  await page.waitForTimeout(150)

  const bgAfter = await page.evaluate((id) => {
    const win = window as unknown as { __readTerminalThemeBg?: (sid: string) => string | null }
    return id ? (win.__readTerminalThemeBg?.(id) ?? null) : null
  }, sessionIdBefore)

  // The session element must still be the same — no remount.
  const sessionIdAfter = await page.evaluate(() => {
    const el = document.querySelector('[data-session-id]') as HTMLElement | null
    return el?.dataset['sessionId'] ?? null
  })

  expect(sessionIdAfter).toBe(sessionIdBefore)
  expect(bgBefore).toBeTruthy()
  expect(bgAfter).toBeTruthy()
  expect(bgAfter).not.toBe(bgBefore)
  expect(bgAfter).toContain('#112233')
})
