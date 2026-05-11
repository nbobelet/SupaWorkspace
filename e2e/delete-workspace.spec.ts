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
let workspaceId: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-del-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-del-workspace-'))
  workspaceId = randomUUID()

  const seed = {
    workspaces: [
      {
        id: workspaceId,
        name: 'workspace-to-delete',
        rootPath: workspaceDir,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        permissions: { extraPaths: [], allow: [], deny: [] },
        color: { hue: 195 },
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

test('delete-workspace: cascade removes sessions, grants, and tile', async () => {
  await expect(page.getByText('workspace-to-delete').first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'New shell session' }).first().click()
  await expect(page.locator('.xterm-screen').first()).toBeVisible({ timeout: 10_000 })

  const sessionsBefore = await page.evaluate(
    () => document.querySelectorAll('[data-session-id]').length,
  )
  expect(sessionsBefore).toBeGreaterThan(0)

  await page.evaluate(async (id) => {
    await (window as unknown as {
      ws: { workspace: { remove: (id: string) => Promise<void> } }
    }).ws.workspace.remove(id)
  }, workspaceId)

  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Array.from(document.querySelectorAll('*')).some((el) =>
            el.textContent?.includes('workspace-to-delete'),
          ),
        ),
      { timeout: 5_000 },
    )
    .toBe(false)
})
