import { useEffect } from 'react'
import { tinykeys, type KeyBindingMap } from 'tinykeys'
import { returnFocusToActiveSession } from '../lib/commandBarFocus'

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
  toggleInputBar: () => void
  cycleLayout: () => void
  reorderActiveTabLeft: () => void
  reorderActiveTabRight: () => void
  splitVertical: () => void
  splitHorizontal: () => void
  focusSessionCommandBar: () => void
  focusWorkspaceCommandBar: () => void
  toggleAppSettings: () => void
  toggleSearchBar: () => void
}

// Bar-toggle, palette, settings and rename handlers keep focus where they
// sent it; every other navigation handler returns focus to the active xterm
// after firing so typing is never stranded on a stale element.
const FOCUS_EXEMPT: ReadonlySet<keyof KeybindingHandlers> = new Set<keyof KeybindingHandlers>([
  'focusSessionCommandBar',
  'focusWorkspaceCommandBar',
  'togglePalette',
  'toggleAppSettings',
  'renameActiveTab',
  'renameActiveWorkspace',
  'toggleSearchBar',
])

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (el.closest('.xterm')) return true
  return false
}

// Same editable-guard as `isEditableTarget`, MINUS the `.xterm` clause.
// Used only by the SearchBar toggle (Cmd+F / Ctrl+F): the user-visible
// contract is "press the chord while typing in the terminal -> SearchBar
// opens", so xterm-focus must NOT block the binding. Every other field
// (input/textarea/select/contenteditable) still suppresses the chord —
// users typing in a rename field or the bug-report dialog get the
// browser's native find.
function isEditableTargetExceptXterm(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

function guardWithFocusRestore(
  name: keyof KeybindingHandlers,
  handler: () => void,
): (event: KeyboardEvent) => void {
  const restoreFocus = !FOCUS_EXEMPT.has(name)
  // Documented exception: the SearchBar toggle must fire even when xterm
  // has focus (cf. `isEditableTargetExceptXterm`).
  const guard = name === 'toggleSearchBar' ? isEditableTargetExceptXterm : isEditableTarget
  return (event) => {
    if (guard(event.target)) return
    event.preventDefault()
    handler()
    if (restoreFocus) returnFocusToActiveSession()
  }
}

export function useKeybindings(handlers: KeybindingHandlers): void {
  useEffect(() => {
    const bindings: KeyBindingMap = {
      '$mod+Tab': guardWithFocusRestore('cycleSessionNext', handlers.cycleSessionNext),
      '$mod+Shift+Tab': guardWithFocusRestore('cycleSessionPrev', handlers.cycleSessionPrev),
      '$mod+t': guardWithFocusRestore('spawnLastUsed', handlers.spawnLastUsed),
      '$mod+w': guardWithFocusRestore('killActive', handlers.killActive),
      '$mod+Shift+]': guardWithFocusRestore('cycleWorkspaceNext', handlers.cycleWorkspaceNext),
      '$mod+Shift+[': guardWithFocusRestore('cycleWorkspacePrev', handlers.cycleWorkspacePrev),
      '$mod+r': guardWithFocusRestore('renameActiveTab', handlers.renameActiveTab),
      F2: guardWithFocusRestore('renameActiveWorkspace', handlers.renameActiveWorkspace),
      '$mod+k': guardWithFocusRestore('togglePalette', handlers.togglePalette),
      '$mod+/': guardWithFocusRestore('toggleInputBar', handlers.toggleInputBar),
      '$mod+\\': guardWithFocusRestore('cycleLayout', handlers.cycleLayout),
      '$mod+Shift+ArrowLeft': guardWithFocusRestore(
        'reorderActiveTabLeft',
        handlers.reorderActiveTabLeft,
      ),
      '$mod+Shift+ArrowRight': guardWithFocusRestore(
        'reorderActiveTabRight',
        handlers.reorderActiveTabRight,
      ),
      '$mod+Shift+\\': guardWithFocusRestore('splitVertical', handlers.splitVertical),
      '$mod+Shift+-': guardWithFocusRestore('splitHorizontal', handlers.splitHorizontal),
      '$mod+i': guardWithFocusRestore('focusSessionCommandBar', handlers.focusSessionCommandBar),
      '$mod+,': guardWithFocusRestore('toggleAppSettings', handlers.toggleAppSettings),
      '$mod+f': guardWithFocusRestore('toggleSearchBar', handlers.toggleSearchBar),
    }
    for (let n = 1; n <= 9; n += 1) {
      bindings[`$mod+Digit${n}`] = guardWithFocusRestore('jumpToSession', () =>
        handlers.jumpToSession(n - 1),
      )
    }
    return tinykeys(window, bindings)
  }, [handlers])
}
