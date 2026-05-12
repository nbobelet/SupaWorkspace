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

// `Meta+F` on darwin, `Control+F` everywhere else. Playwright maps the
// chord through the OS focus-target like a native event.
const SEARCH_CHORD = platform() === 'darwin' ? 'Meta+f' : 'Control+f'

let app: ElectronApplication
let page: Page
let userDataDir: string
let workspaceDir: string

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-search-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-search-workspace-'))
  writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# search workspace\n', 'utf8')

  const seed = {
    workspaces: [
      {
        id: randomUUID(),
        name: 'search-workspace',
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

test('search bar toggles via Cmd/Ctrl+F, finds matches, and Escape restores terminal focus', async () => {
  await expect(page.getByText('search-workspace').first()).toBeVisible({ timeout: 10_000 })

  await page.getByRole('button', { name: 'New shell session' }).first().click()

  const xtermContainer = page.locator('.xterm').first()
  await expect(xtermContainer).toBeVisible({ timeout: 10_000 })

  // Write a multi-line payload directly into xterm via the debug helper so
  // we do not depend on the host shell having `printf` available. We use
  // `term.write` indirectly through Playwright's `evaluate` against the
  // global helper. Falls back to keyboard typing if the helper is missing.
  await xtermContainer.click()

  // Type one search target and the error line via the shell. `echo` is
  // universally available on the test runners we care about (Windows
  // ships PowerShell which also handles `echo`).
  await page.keyboard.type('echo "hello world from supa"')
  await page.keyboard.press('Enter')
  await page.keyboard.type('echo "error: synthetic boom"')
  await page.keyboard.press('Enter')

  // Wait for both lines to land in the terminal buffer.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const win = window as unknown as { __readTerminal?: (id: string) => string | null }
          const el = document.querySelector('[data-session-id]') as HTMLElement | null
          const id = el?.dataset['sessionId']
          return id ? (win.__readTerminal?.(id) ?? '') : ''
        }),
      { timeout: 15_000 },
    )
    .toContain('hello world from supa')

  // Open the search bar via keyboard chord. The Cmd+F binding has a
  // documented `.xterm` exception so this fires even though xterm has
  // focus.
  await page.keyboard.press(SEARCH_CHORD)

  const searchBar = page.getByRole('search', { name: 'Search terminal' })
  await expect(searchBar).toBeVisible({ timeout: 5_000 })

  const searchInput = searchBar.getByLabel('Search query')
  await expect(searchInput).toBeFocused()
  await searchInput.fill('world')

  // Hit count text — at least one match.
  await expect
    .poll(
      async () => {
        const text = await searchBar
          .locator('[aria-live="polite"]')
          .first()
          .textContent()
        return text?.trim() ?? ''
      },
      { timeout: 5_000 },
    )
    .toMatch(/^[1-9]\d* \/ [1-9]\d*$/)

  // The overview ruler container exists once `overviewRulerWidth` was set
  // on the Terminal constructor. xterm 5.5 renders it as a `<canvas>`
  // sibling of `.xterm-screen`; the class name has historically been
  // `.xterm-decoration-overview-ruler`. We accept either selector.
  const rulerCandidates = page.locator(
    '.xterm-decoration-overview-ruler, canvas.xterm-decoration-overview-ruler',
  )
  await expect(rulerCandidates.first()).toBeAttached({ timeout: 5_000 })

  // Escape closes the bar and returns focus to the xterm helper textarea.
  await searchInput.press('Escape')
  await expect(searchBar).toBeHidden({ timeout: 5_000 })

  const focusedTag = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    return {
      tag: el?.tagName ?? null,
      classes: el?.className ?? '',
    }
  })
  // After Escape, focus must land on the xterm helper textarea (the
  // hidden input xterm uses to capture keystrokes).
  expect(focusedTag.classes).toContain('xterm-helper-textarea')
})
