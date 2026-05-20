import { describe, expect, it } from 'vitest'
import type { Workspace } from '@shared/workspace'
import { HOME_WORKSPACE_ID } from '@shared/workspace'
import { effectiveCwdLabel, isDeletableWorkspace, sortWorkspacesHomeFirst } from './homeWorkspace'

function ws(over: Partial<Workspace> & Pick<Workspace, 'id' | 'kind'>): Workspace {
  return {
    name: over.name ?? 'ws',
    rootPath: 'rootPath' in over ? (over.rootPath ?? null) : '/tmp/ws',
    workdir: over.workdir ?? null,
    createdAt: 0,
    lastOpenedAt: 0,
    permissions: { extraPaths: [], allow: [], deny: [] },
    ...over,
  }
}

const home = ws({ id: HOME_WORKSPACE_ID, kind: 'home', rootPath: null })
const folder = ws({ id: '11111111-1111-4111-8111-111111111111', kind: 'folder', rootPath: '/tmp/proj' })

describe('isDeletableWorkspace', () => {
  it('pins Home as non-deletable', () => {
    expect(isDeletableWorkspace(home)).toBe(false)
  })

  it('allows deleting a folder workspace', () => {
    expect(isDeletableWorkspace(folder)).toBe(true)
  })
})

describe('sortWorkspacesHomeFirst', () => {
  it('moves Home to the front regardless of input order', () => {
    const sorted = sortWorkspacesHomeFirst([folder, home])
    expect(sorted.map((w) => w.id)).toEqual([HOME_WORKSPACE_ID, folder.id])
  })

  it('is a no-op ordering when there is no Home', () => {
    const sorted = sortWorkspacesHomeFirst([folder])
    expect(sorted.map((w) => w.id)).toEqual([folder.id])
  })
})

describe('effectiveCwdLabel', () => {
  it('shows rootPath for a folder workspace', () => {
    expect(effectiveCwdLabel(folder)).toBe('/tmp/proj')
  })

  it('shows the workdir hint for a null-rootPath Home with a workdir', () => {
    expect(effectiveCwdLabel({ rootPath: null, workdir: '/tmp/hint' })).toBe('/tmp/hint')
  })

  it('falls back to a neutral label for a bare null-rootPath workspace', () => {
    expect(effectiveCwdLabel({ rootPath: null, workdir: null })).toBe('Global — no folder')
  })
})
