import { describe, expect, it } from 'vitest'
import type { SubAppId } from '@shared/sub-app'
import { SUB_APP_ORDER } from './workspaceSubAppOrder'

describe('SUB_APP_ORDER', () => {
  // Regression: the sidebar sub-app rows must read top-to-bottom as
  // Dashboard, SupaTTY, Explorer, TODO, Notes. A prior order placed Explorer
  // above SupaTTY.
  it('orders the sub-app rows Dashboard, SupaTTY, Explorer, TODO, Notes', () => {
    expect([...SUB_APP_ORDER]).toEqual<SubAppId[]>([
      'dashboard',
      'supatty',
      'explorer',
      'todo',
      'notes',
    ])
  })

  it('lists every sub-app exactly once', () => {
    const all: SubAppId[] = ['supatty', 'notes', 'todo', 'dashboard', 'explorer']
    expect([...SUB_APP_ORDER].sort()).toEqual(all.sort())
    expect(new Set(SUB_APP_ORDER).size).toBe(SUB_APP_ORDER.length)
  })
})
