import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { promises as fsp } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BugReportStore, type BugReportEnv } from './BugReportStore'

function makeEnv(overrides: Partial<BugReportEnv> = {}): BugReportEnv {
  return {
    isPackaged: false,
    appPath: process.cwd(),
    appVersion: '0.1.0-test',
    userDataDir: tmpdir(),
    openPath: async () => '',
    ...overrides,
  }
}

describe('BugReportStore', () => {
  let workDir: string
  const prevEnv = process.env['SUPA_BUG_REPORTS_DIR']

  beforeEach(async () => {
    workDir = await fsp.mkdtemp(join(tmpdir(), 'supa-bug-report-'))
    process.env['SUPA_BUG_REPORTS_DIR'] = workDir
  })

  afterEach(async () => {
    if (prevEnv === undefined) delete process.env['SUPA_BUG_REPORTS_DIR']
    else process.env['SUPA_BUG_REPORTS_DIR'] = prevEnv
    await fsp.rm(workDir, { recursive: true, force: true })
  })

  it('resolveDir honors SUPA_BUG_REPORTS_DIR override', () => {
    const store = new BugReportStore(makeEnv())
    expect(store.resolveDir()).toBe(workDir)
  })

  it('create writes a file whose frontmatter round-trips through list', async () => {
    const store = new BugReportStore(makeEnv())
    const res = await store.create({
      title: 'Crash on workspace open',
      severity: 'high',
      description: 'It crashes when I open a workspace.',
      steps_to_reproduce: '1. Click open\n2. Boom',
    })
    expect(res.id).toMatch(/^[0-9a-f-]{36}$/i)
    expect(res.path.startsWith(workDir)).toBe(true)

    const content = await fsp.readFile(res.path, 'utf8')
    expect(content.startsWith('---\n')).toBe(true)
    expect(content).toContain(`id: ${res.id}`)
    expect(content).toContain('severity: high')
    expect(content).toContain('status: open')
    expect(content).toContain('## Description')
    expect(content).toContain('It crashes when I open a workspace.')

    const reports = await store.list()
    expect(reports).toHaveLength(1)
    const summary = reports[0]!
    expect(summary.id).toBe(res.id)
    expect(summary.title).toBe('Crash on workspace open')
    expect(summary.severity).toBe('high')
    expect(summary.status).toBe('open')
    expect(summary.path).toBe(res.path)
  })

  it('list skips malformed files without throwing', async () => {
    const store = new BugReportStore(makeEnv())
    await store.create({
      title: 'Valid one',
      severity: 'low',
      description: 'A valid bug.',
    })
    await fsp.writeFile(join(workDir, 'broken-no-frontmatter.md'), 'not a bug report', 'utf8')
    await fsp.writeFile(
      join(workDir, 'broken-frontmatter.md'),
      '---\nfoo: bar\n---\n\n## Description\nnope\n',
      'utf8',
    )

    const reports = await store.list()
    expect(reports).toHaveLength(1)
    expect(reports[0]!.title).toBe('Valid one')
  })

  it('list returns empty array when directory does not exist yet', async () => {
    const missing = join(workDir, 'does-not-exist')
    process.env['SUPA_BUG_REPORTS_DIR'] = missing
    const store = new BugReportStore(makeEnv())
    const reports = await store.list()
    expect(reports).toEqual([])
  })

  it('falls back to userData when not dev and no override', () => {
    delete process.env['SUPA_BUG_REPORTS_DIR']
    const userDataDir = workDir
    const store = new BugReportStore(makeEnv({ isPackaged: true, userDataDir }))
    expect(store.resolveDir()).toBe(join(userDataDir, 'bug-reports'))
  })
})
