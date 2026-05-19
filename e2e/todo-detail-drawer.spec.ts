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

const TASK_TITLE = 'Drawer demo task'

test.beforeAll(async () => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cw-e2e-todo-user-'))
  workspaceDir = mkdtempSync(join(tmpdir(), 'cw-e2e-todo-workspace-'))
  writeFileSync(join(workspaceDir, 'CLAUDE.md'), '# test workspace\n', 'utf8')

  const workspaceId = randomUUID()
  const seed = {
    workspaces: [
      {
        id: workspaceId,
        name: 'todo-e2e-workspace',
        rootPath: workspaceDir,
        createdAt: Date.now(),
        lastOpenedAt: Date.now(),
        permissions: { extraPaths: [], allow: [], deny: [] },
      },
    ],
  }
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, 'workspaces.json'), JSON.stringify(seed), 'utf8')

  // Seed the per-workspace TODO store directly (electron-store `todo.json`)
  // so the board has one card to open without driving the create modal.
  const now = Date.now()
  const taskId = randomUUID()
  const todoSeed = {
    byWorkspace: {
      [workspaceId]: {
        schemaVersion: 2,
        columns: [
          { id: 'created', name: 'Created', color: '#94a3b8', order: 0, builtin: true },
          { id: 'running', name: 'Running', color: '#3b82f6', order: 1, builtin: true },
          { id: 'done', name: 'Done', color: '#22c55e', order: 2, builtin: true },
          { id: 'archive', name: 'Archive', color: '#64748b', order: 3, builtin: true },
        ],
        tasks: [
          {
            kind: 'todo',
            id: taskId,
            title: TASK_TITLE,
            description: 'Seeded for the detail-drawer e2e.',
            columnId: 'created',
            createdAt: now,
            dateStarted: now,
            dateDone: null,
            dateArchive: null,
            severity: 'medium',
            deadline: null,
          },
        ],
        columnOrder: { created: [taskId], running: [], done: [], archive: [] },
      },
    },
  }
  writeFileSync(join(userDataDir, 'todo.json'), JSON.stringify(todoSeed), 'utf8')

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

test('card click opens read-only drawer; Edit toggles editor; save returns to view', async () => {
  await expect(page.getByText('todo-e2e-workspace').first()).toBeVisible({ timeout: 10_000 })

  // The workspace accordion is collapsed on load (and aria-hidden, so inner
  // buttons have no accessible name). Expand it via the chevron — the exact
  // name avoids matching the dnd-kit `role=button` wrapper on the row <li>.
  const todoBtn = page.getByRole('button', { name: 'TODO', exact: true }).first()
  await expect(async () => {
    if (!(await todoBtn.isVisible().catch(() => false))) {
      await page.getByRole('button', { name: 'Expand session list', exact: true }).first().click()
    }
    await expect(todoBtn).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
  await todoBtn.click()

  // Click the card -> read-only drawer opens, editor form does NOT.
  // getByLabel targets the inner button only (the dnd-kit <li> wrapper also
  // gets a computed role=button name, which would trip strict mode).
  const card = page.getByLabel(`Open task ${TASK_TITLE}`)
  await expect(card).toBeVisible({ timeout: 10_000 })
  await card.click()

  await expect(page.getByRole('dialog', { name: `Task detail: ${TASK_TITLE}` })).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.locator('#todo-title')).toHaveCount(0)

  // Edit -> editor form appears prefilled.
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click()
  const titleInput = page.locator('#todo-title')
  await expect(titleInput).toBeVisible({ timeout: 5_000 })
  await expect(titleInput).toHaveValue(TASK_TITLE)

  // Save -> back to the read-only drawer, now showing the edited title.
  const newTitle = `${TASK_TITLE} (edited)`
  await titleInput.fill(newTitle)
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()

  await expect(page.getByRole('dialog', { name: `Task detail: ${newTitle}` })).toBeVisible({
    timeout: 5_000,
  })
  await expect(page.locator('#todo-title')).toHaveCount(0)
})
