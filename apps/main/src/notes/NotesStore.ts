import Store from 'electron-store'

interface NotesShape {
  byWorkspace: Record<string, string>
  userNotes?: string
}

export class NotesStore {
  private readonly store: Store<NotesShape>

  constructor() {
    this.store = new Store<NotesShape>({
      name: 'notes',
      defaults: { byWorkspace: {} },
      clearInvalidConfig: true,
    })
  }

  get(workspaceId: string): string {
    const byWorkspace = this.store.get('byWorkspace', {})
    if (byWorkspace[workspaceId] !== undefined) {
      return byWorkspace[workspaceId]
    }
    const legacy = this.store.get('userNotes', '')
    if (legacy.length > 0 && Object.keys(byWorkspace).length === 0) {
      const migrated = { ...byWorkspace, [workspaceId]: legacy }
      this.store.set('byWorkspace', migrated)
      this.store.delete('userNotes')
      return legacy
    }
    return ''
  }

  set(workspaceId: string, content: string): void {
    const byWorkspace = this.store.get('byWorkspace', {})
    this.store.set('byWorkspace', { ...byWorkspace, [workspaceId]: content })
  }
}
