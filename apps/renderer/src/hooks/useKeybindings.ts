import { useEffect } from 'react'
import { tinykeys, type KeyBindingMap } from 'tinykeys'

export interface KeybindingHandlers {
  cycleSessionNext: () => void
  cycleSessionPrev: () => void
  jumpToSession: (index: number) => void
  spawnLastUsed: () => void
  killActive: () => void
  cycleWorkspaceNext: () => void
  cycleWorkspacePrev: () => void
  renameActiveTab: () => void
  renameActiveWorkspace: () => void
  togglePalette: () => void
  cycleLayout: () => void
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.closest('.xterm')) return true
  return false
}

function guard(handler: () => void): (event: KeyboardEvent) => void {
  return (event) => {
    if (isEditableTarget(event.target)) return
    event.preventDefault()
    handler()
  }
}

export function useKeybindings(handlers: KeybindingHandlers): void {
  useEffect(() => {
    const bindings: KeyBindingMap = {
      '$mod+Tab': guard(handlers.cycleSessionNext),
      '$mod+Shift+Tab': guard(handlers.cycleSessionPrev),
      '$mod+t': guard(handlers.spawnLastUsed),
      '$mod+w': guard(handlers.killActive),
      '$mod+Shift+]': guard(handlers.cycleWorkspaceNext),
      '$mod+Shift+[': guard(handlers.cycleWorkspacePrev),
      '$mod+r': guard(handlers.renameActiveTab),
      F2: guard(handlers.renameActiveWorkspace),
      '$mod+k': guard(handlers.togglePalette),
      '$mod+\\': guard(handlers.cycleLayout),
    }
    for (let n = 1; n <= 9; n += 1) {
      bindings[`$mod+Digit${n}`] = guard(() => handlers.jumpToSession(n - 1))
    }
    return tinykeys(window, bindings)
  }, [handlers])
}
