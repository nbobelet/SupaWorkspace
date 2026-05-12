import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir, platform } from 'node:os'
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
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-progress-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-progress-workspace-'))
  writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# progress pill smoke\n', 'utf8')

  const seed = {
    workspaces: [
      {
        id: randomUUID(),
        name: 'progress-smoke',
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

test('OSC 9;4 progress sequence renders the per-pane progress pill', async () => {
  await expect(page.getByText('progress-smoke').first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'New shell session' }).first().click()

  const xtermContainer = page.locator('.xterm').first()
  await expect(xtermContainer).toBeVisible({ timeout: 10_000 })
  await xtermContainer.click()

  // Emit OSC 9;4;1;42 BEL from the PTY. On Windows the default shell is
  // `cmd.exe` / `powershell` — both honor printf-equivalents differently,
  // so we type a per-shell command. On POSIX, `printf` is universally
  // available.
  if (platform() === 'win32') {
    // PowerShell: write the raw escape via the [char] cast — `0x1b` (ESC)
    // + the OSC body + `0x07` (BEL).
    await page.keyboard.type(
      `[Console]::Out.Write([char]0x1b + ']9;4;1;42' + [char]0x07)`,
    )
  } else {
    await page.keyboard.type(String.raw`printf '\033]9;4;1;42\a'`)
  }
  await page.keyboard.press('Enter')

  // The progress pill is added as a sibling of the live-region state
  // badge; it carries `data-progress-state="1"` when in the `set` state.
  const pill = page.locator('[data-progress-state="1"]').first()
  await expect(pill).toBeVisible({ timeout: 15_000 })
  await expect(pill).toContainText('42%', { timeout: 5_000 })
})
