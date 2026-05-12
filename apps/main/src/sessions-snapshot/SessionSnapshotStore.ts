import Store from 'electron-store'
import type { SessionSnapshot, SessionSnapshotEnvelope } from '@shared/snapshot'

interface ShapeV1 {
  envelope: SessionSnapshotEnvelope
}

const EMPTY: SessionSnapshotEnvelope = { entries: [], savedAt: 0 }

export class SessionSnapshotStore {
  private readonly store: Store<ShapeV1>
  private locked = false

  constructor() {
    this.store = new Store<ShapeV1>({
      name: 'sessions-snapshot',
      defaults: { envelope: EMPTY },
      clearInvalidConfig: true,
    })
  }

  get(): SessionSnapshotEnvelope {
    return this.store.get('envelope', EMPTY)
  }

  save(entries: SessionSnapshot[]): void {
    if (this.locked) return
    this.store.set('envelope', { entries, savedAt: Date.now() })
  }

  clear(): void {
    this.store.set('envelope', EMPTY)
  }

  lock(): void {
    this.locked = true
  }
}
