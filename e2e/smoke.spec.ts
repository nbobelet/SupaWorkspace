import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { _electron as electron, expect, test } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

const ROOT = resolve(__dirname, '..')
const MAIN_ENTRY = join(ROOT, 'out', 'main', 'index.js')

let app: ElectronApplication
let page: Page
let userDataDir: string
let workspaceDir: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-workspace-'))
  writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# test workspace\n', 'utf8')

  const seed = {
    workspaces: [
      {
        id: randomUUID(),
        name: 'e2e-workspace',
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

test('smoke: workspace listed, spawn shell, echo ok appears', async () => {
  await expect(page.getByText('ClaudeWorkspace').first()).toBeVisible({ timeout: 10_000 })

  await expect(page.getByText('e2e-workspace')).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: '+ shell' }).first().click()

  const xtermViewport = page.locator('.xterm-screen').first()
  await expect(xtermViewport).toBeVisible({ timeout: 10_000 })

  await xtermViewport.click()
  await page.keyboard.type('echo claude-workspace-ok')
  await page.keyboard.press('Enter')

  await expect(page.locator('.xterm-rows')).toContainText('claude-workspace-ok', { timeout: 15_000 })
})
