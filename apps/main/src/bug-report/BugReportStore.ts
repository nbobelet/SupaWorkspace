import { promises as fsp, existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type {
  BugReportCreateRequest,
  BugReportCreateResponse,
  BugReportSummary,
  BugReportSeverity,
  BugReportStatus,
} from '@shared/bugReport'
import { BugReportSummary as BugReportSummarySchema } from '@shared/bugReport'

export interface BugReportEnv {
  isPackaged: boolean
  appPath: string
  appVersion: string
  userDataDir: string
  openPath: (p: string) => Promise<string>
}

interface FrontmatterFields {
  id: string
  created_at: string
  title: string
  severity: BugReportSeverity
  status: BugReportStatus
  app_version: string
  platform: string
  electron_version: string
}

const ROOT_WALK_MAX_DEPTH = 12
const KNOWN_ROOT_NAME = 'supa-workspace'

export class BugReportStore {
  private resolvedDir: string | null = null
  private warnedFallback = false

  constructor(private readonly env: BugReportEnv) {}

  resolveDir(): string {
    if (this.resolvedDir) return this.resolvedDir

    const override = process.env['SUPA_BUG_REPORTS_DIR']
    if (override && override.trim().length > 0) {
      this.resolvedDir = resolve(override.trim())
      return this.resolvedDir
    }

    if (!this.env.isPackaged) {
      const root = findProjectRoot(this.env.appPath)
      if (root) {
        this.resolvedDir = join(root, 'bug-reports')
        return this.resolvedDir
      }
    }

    if (!this.warnedFallback) {
      console.warn(
        '[bug-report] could not locate dev project root — falling back to userData/bug-reports',
      )
      this.warnedFallback = true
    }
    this.resolvedDir = join(this.env.userDataDir, 'bug-reports')
    return this.resolvedDir
  }

  async create(req: BugReportCreateRequest): Promise<BugReportCreateResponse> {
    const dir = this.resolveDir()
    await fsp.mkdir(dir, { recursive: true })
    const id = randomUUID()
    const createdAt = new Date().toISOString()
    const slug = makeSlug(req.title)
    const filename = `${stampFromIso(createdAt)}-${slug}.md`
    const filePath = join(dir, filename)
    const body = renderMarkdown({
      id,
      createdAt,
      title: req.title,
      severity: req.severity,
      description: req.description,
      steps_to_reproduce: req.steps_to_reproduce,
      expected_behavior: req.expected_behavior,
      actual_behavior: req.actual_behavior,
      appVersion: this.env.appVersion,
    })
    await fsp.writeFile(filePath, body, 'utf8')
    console.log('[bug-report] created', id, filePath)
    return { id, path: filePath }
  }

  async list(): Promise<BugReportSummary[]> {
    const dir = this.resolveDir()
    let entries: string[]
    try {
      entries = await fsp.readdir(dir)
    } catch {
      return []
    }
    const summaries: BugReportSummary[] = []
    for (const name of entries) {
      if (!name.endsWith('.md')) continue
      const filePath = join(dir, name)
      try {
        const content = await fsp.readFile(filePath, 'utf8')
        const fm = parseFrontmatter(content)
        if (!fm) {
          console.warn('[bug-report] skip malformed (no frontmatter)', filePath)
          continue
        }
        const candidate = {
          id: fm.id,
          title: fm.title,
          severity: fm.severity,
          status: fm.status,
          created_at: fm.created_at,
          path: filePath,
        }
        const parsed = BugReportSummarySchema.safeParse(candidate)
        if (!parsed.success) {
          console.warn('[bug-report] skip malformed', filePath, parsed.error.message)
          continue
        }
        summaries.push(parsed.data)
      } catch (err) {
        console.warn('[bug-report] skip unreadable', filePath, err)
      }
    }
    summaries.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    return summaries
  }

  async revealDir(): Promise<void> {
    const dir = this.resolveDir()
    await fsp.mkdir(dir, { recursive: true })
    await this.env.openPath(dir)
  }
}

function findProjectRoot(startDir: string): string | null {
  let current = resolve(startDir)
  for (let i = 0; i < ROOT_WALK_MAX_DEPTH; i++) {
    const pkgPath = join(current, 'package.json')
    if (existsSync(pkgPath)) {
      try {
        const raw = readFileSync(pkgPath, 'utf8')
        const json = JSON.parse(raw) as { name?: string }
        if (json && json.name === KNOWN_ROOT_NAME) return current
      } catch {
        // ignore unreadable / non-JSON files and keep walking
      }
    }
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return null
}

function makeSlug(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return slug.length > 0 ? slug : 'untitled'
}

function stampFromIso(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/)
  if (!m) return iso.replace(/\D/g, '').slice(0, 14)
  return `${m[1]}${m[2]}${m[3]}-${m[4]}${m[5]}${m[6]}`
}

function yamlEscape(value: string): string {
  // Quote any value that contains characters that would confuse a naive
  // line-based parser (newlines, leading/trailing whitespace, `:`, `#`, quotes).
  if (/[\n\r"'#:]/.test(value) || /^\s|\s$/.test(value)) {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`
  }
  return value
}

function yamlUnescape(value: string): string {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return trimmed
}

function renderMarkdown(opts: {
  id: string
  createdAt: string
  title: string
  severity: BugReportSeverity
  description: string
  steps_to_reproduce?: string
  expected_behavior?: string
  actual_behavior?: string
  appVersion: string
}): string {
  const lines = [
    '---',
    `id: ${opts.id}`,
    `created_at: ${opts.createdAt}`,
    `title: ${yamlEscape(opts.title)}`,
    `severity: ${opts.severity}`,
    `status: open`,
    `app_version: ${yamlEscape(opts.appVersion)}`,
    `platform: ${process.platform}`,
    `electron_version: ${process.versions.electron ?? 'unknown'}`,
    '---',
    '',
    '## Description',
    opts.description.trim(),
    '',
    '## Steps to reproduce',
    (opts.steps_to_reproduce ?? '').trim(),
    '',
    '## Expected behavior',
    (opts.expected_behavior ?? '').trim(),
    '',
    '## Actual behavior',
    (opts.actual_behavior ?? '').trim(),
    '',
  ]
  return lines.join('\n')
}

function parseFrontmatter(content: string): FrontmatterFields | null {
  if (!content.startsWith('---')) return null
  const rest = content.slice(3).replace(/^\r?\n/, '')
  const end = rest.indexOf('\n---')
  if (end === -1) return null
  const block = rest.slice(0, end)
  const fields: Record<string, string> = {}
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trimEnd()
    if (line.length === 0) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = yamlUnescape(line.slice(idx + 1))
    if (key.length > 0) fields[key] = value
  }
  const id = fields['id']
  const createdAt = fields['created_at']
  const title = fields['title']
  const severity = fields['severity']
  const status = fields['status'] ?? 'open'
  const appVersion = fields['app_version'] ?? ''
  const platform = fields['platform'] ?? ''
  const electronVersion = fields['electron_version'] ?? ''
  if (!id || !createdAt || !title || !severity) return null
  return {
    id,
    created_at: createdAt,
    title,
    severity: severity as BugReportSeverity,
    status: status as BugReportStatus,
    app_version: appVersion,
    platform,
    electron_version: electronVersion,
  }
}
