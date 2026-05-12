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

const MARKER = 'SUPATERMINAL_E2E_MARKER'

let app: ElectronApplication
let page: Page
let userDataDir: string
let workspaceDir: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-submit-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-submit-workspace-'))
  writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# test workspace\n', 'utf8')

  const seed = {
    workspaces: [
      {
        id: randomUUID(),
        name: 'e2e-submit-workspace',
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

test('command input bar: submit executes the command in the focused PTY', async () => {
  await expect(page.getByText('e2e-submit-workspace').first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'New shell session' }).first().click()
  await expect(page.locator('.xterm-screen').first()).toBeVisible({ timeout: 10_000 })

  const sessionId = await page.evaluate(() => {
    const el = document.querySelector('[data-session-id]') as HTMLElement | null
    return el?.dataset['sessionId'] ?? null
  })
  expect(sessionId).toBeTruthy()

  const inputBar = page.getByTestId('command-input-bar').locator('textarea')
  await expect(inputBar).toBeVisible({ timeout: 5_000 })
  await inputBar.click()
  await inputBar.fill(`echo ${MARKER}`)
  await inputBar.press('Enter')

  await expect
    .poll(
      async () =>
        page.evaluate((id) => {
          const win = window as unknown as { __readTerminal?: (id: string) => string | null }
          return id ? (win.__readTerminal?.(id) ?? '') : ''
        }, sessionId),
      { timeout: 15_000 },
    )
    .toMatch(new RegExp(`${MARKER}[\\s\\S]*${MARKER}`))

  const buffer = await page.evaluate((id) => {
    const win = window as unknown as { __readTerminal?: (id: string) => string | null }
    return id ? (win.__readTerminal?.(id) ?? '') : ''
  }, sessionId)

  const occurrences = buffer.split(MARKER).length - 1
  expect(occurrences).toBeGreaterThanOrEqual(2)

  const finalValue = await inputBar.inputValue()
  expect(finalValue).toBe('')
})
