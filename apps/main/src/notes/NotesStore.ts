import Store from 'electron-store'

interface NotesShape {
  userNotes: string
}

export class NotesStore {
  private readonly store: Store<NotesShape>

  constructor() {
    this.store = new Store<NotesShape>({
      name: 'notes',
      defaults: { userNotes: '' },
      clearInvalidConfig: true,
    })
  }

  get(): string {
    return this.store.get('userNotes', '')
  }

  set(content: string): void {
    this.store.set('userNotes', content)
  }
}
