import Store from 'electron-store'

interface InputHistoryShape {
  entries: string[]
}

const MAX_ENTRIES = 200

export class InputHistoryStore {
  private readonly store: Store<InputHistoryShape>

  constructor() {
    this.store = new Store<InputHistoryShape>({
      name: 'input-history',
      defaults: { entries: [] },
      clearInvalidConfig: true,
    })
  }

  get(): string[] {
    return this.store.get('entries', [])
  }

  append(entry: string): string[] {
    const trimmed = entry.trim()
    if (trimmed.length === 0) return this.get()
    const current = this.get()
    const last = current[current.length - 1]
    const next = last === trimmed ? current : [...current, trimmed]
    const capped = next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next
    this.store.set('entries', capped)
    return capped
  }

  clear(): void {
    this.store.set('entries', [])
  }
}
