import { describe, expect, it } from 'vitest'
import { HOME_WORKSPACE_ID, HOME_WORKSPACE_NAME, type Workspace } from '@shared/workspace'
import type { SessionState, SessionType } from '@shared/session'
import type { RendererSession } from '../../state/sessionStore'
import { buildGlobalSessionIndex, countWorkspacesWithSessions } from './globalSessionIndex'

function mkWs(over: Partial<Workspace> & Pick<Workspace, 'id' | 'name'>): Workspace {
  return {
    kind: 'folder',
    rootPath: null,
    workdir: null,
    createdAt: 0,
    lastOpenedAt: 0,
    deletedAt: null,
    permissions: { extraPaths: [], allow: [], deny: [] },
    ...over,
  }
}

function mkSession(
  over: Partial<RendererSession> & Pick<RendererSession, 'id' | 'workspaceId'>,
): RendererSession {
  return {
    type: 'shell' as SessionType,
    label: 'shell',
    state: 'idle' as SessionState,
    exitCode: null,
    hasUnseenAsking: false,
    hasUnseenEnding: false,
    badgeCount: 0,
    ...over,
  }
}

const home = mkWs({ id: HOME_WORKSPACE_ID, name: HOME_WORKSPACE_NAME, kind: 'home' })
const notes = mkWs({ id: 'b1111111-1111-4111-8111-111111111111', name: 'SupaNotes' })

describe('buildGlobalSessionIndex', () => {
  it('returns an empty list when there are no sessions', () => {
    expect(buildGlobalSessionIndex({}, [], [home, notes])).toEqual([])
  })

  it('numbers TTY ordinals per workspace following order', () => {
    const sessions: Record<string, RendererSession> = {
      a: mkSession({ id: 'a', workspaceId: notes.id }),
      b: mkSession({ id: 'b', workspaceId: notes.id }),
    }
    const rows = buildGlobalSessionIndex(sessions, ['a', 'b'], [notes])
    expect(rows.map((r) => r.ttyOrdinal)).toEqual([1, 2])
    expect(rows.map((r) => r.label)).toEqual(['SupaNotes : TTY#1', 'SupaNotes : TTY#2'])
  })

  it('orders Home workspace rows first, then ordinal-ascending within each', () => {
    const sessions: Record<string, RendererSession> = {
      n1: mkSession({ id: 'n1', workspaceId: notes.id }),
      h1: mkSession({ id: 'h1', workspaceId: home.id }),
      n2: mkSession({ id: 'n2', workspaceId: notes.id }),
    }
    // `order` interleaves workspaces; Home must still surface first.
    const rows = buildGlobalSessionIndex(sessions, ['n1', 'h1', 'n2'], [notes, home])
    expect(rows.map((r) => r.label)).toEqual([
      'Home : TTY#1',
      'SupaNotes : TTY#1',
      'SupaNotes : TTY#2',
    ])
  })

  it('carries workspace hue and session status onto each row', () => {
    const colored = mkWs({ id: notes.id, name: 'SupaNotes', color: { hue: 145 } })
    const sessions: Record<string, RendererSession> = {
      a: mkSession({ id: 'a', workspaceId: colored.id, type: 'claude', state: 'asking' }),
    }
    const [row] = buildGlobalSessionIndex(sessions, ['a'], [colored])
    expect(row).toMatchObject({ hue: 145, type: 'claude', status: 'waiting' })
  })

  it('skips sessions whose workspace is unknown', () => {
    const sessions: Record<string, RendererSession> = {
      orphan: mkSession({ id: 'orphan', workspaceId: 'ghost' }),
      ok: mkSession({ id: 'ok', workspaceId: notes.id }),
    }
    const rows = buildGlobalSessionIndex(sessions, ['orphan', 'ok'], [notes])
    expect(rows.map((r) => r.sessionId)).toEqual(['ok'])
  })

  it('defaults hue to null when the workspace has no color', () => {
    const sessions = { a: mkSession({ id: 'a', workspaceId: notes.id }) }
    expect(buildGlobalSessionIndex(sessions, ['a'], [notes])[0]?.hue).toBeNull()
  })
})

describe('countWorkspacesWithSessions', () => {
  it('counts distinct workspaces across the rows', () => {
    const sessions: Record<string, RendererSession> = {
      a: mkSession({ id: 'a', workspaceId: notes.id }),
      b: mkSession({ id: 'b', workspaceId: notes.id }),
      c: mkSession({ id: 'c', workspaceId: home.id }),
    }
    const rows = buildGlobalSessionIndex(sessions, ['a', 'b', 'c'], [home, notes])
    expect(countWorkspacesWithSessions(rows)).toBe(2)
  })

  it('is zero for an empty row set', () => {
    expect(countWorkspacesWithSessions([])).toBe(0)
  })
})
