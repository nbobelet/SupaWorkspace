import { describe, expect, it } from 'vitest'
import { WorkspaceTreeNode } from './workspace'

describe('WorkspaceTreeNode', () => {
  it('parses a full 3-level workspace tree (workspace > sub-app > tab)', () => {
    const workspaceId = '11111111-1111-4111-8111-111111111111'
    const sessionId = '22222222-2222-4222-8222-222222222222'

    const parsed = WorkspaceTreeNode.parse({
      kind: 'workspace',
      workspaceId,
      expanded: true,
      children: [
        {
          kind: 'sub-app',
          workspaceId,
          subAppId: 'supatty',
          expanded: true,
          children: [
            {
              kind: 'tab',
              workspaceId,
              subAppId: 'supatty',
              sessionId,
              active: true,
              status: 'running',
            },
          ],
        },
      ],
    })

    expect(parsed.kind).toBe('workspace')
    if (parsed.kind !== 'workspace') throw new Error('narrowing failed')
    const subApp = parsed.children[0]
    expect(subApp.kind).toBe('sub-app')
    const tab = subApp.children[0]
    expect(tab.kind).toBe('tab')
    expect(tab.sessionId).toBe(sessionId)
    expect(tab.status).toBe('running')
  })

  it('rejects an unknown kind discriminator', () => {
    const result = WorkspaceTreeNode.safeParse({
      kind: 'foo',
      workspaceId: '11111111-1111-4111-8111-111111111111',
      expanded: true,
      children: [],
    })
    expect(result.success).toBe(false)
  })
})
