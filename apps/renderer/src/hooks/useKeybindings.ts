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
  cycleLayout: () => void
  reorderActiveTabLeft: () => void
  reorderActiveTabRight: () => void
  splitVertical: () => void
  splitHorizontal: () => void
  focusWorkspaceCommandBar: () => void
  toggleAppSettings: () => void
  toggleSearchBar: () => void
  copyFromTerminal?: () => void
  pasteToTerminal?: () => void
}

// Bar-toggle, palette, settings and rename handlers keep focus where they
// sent it; every other navigation handler returns focus to the active xterm
// after firing so typing is never stranded on a stale element.
const FOCUS_EXEMPT: ReadonlySet<keyof KeybindingHandlers> = new Set<keyof KeybindingHandlers>([
  'focusWorkspaceCommandBar',
  'togglePalette',
  'toggleAppSettings',
  'renameActiveTab',
  'renameActiveWorkspace',
  'toggleSearchBar',
  'copyFromTerminal',
  'pasteToTerminal',
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
//
// Subtle point: xterm.js captures keystrokes through `.xterm-helper-textarea`,
// a real `<textarea>` element. The standard `INPUT/TEXTAREA/SELECT` check
// would therefore block Cmd+F when the user is typing in the terminal —
// the exact case the brief tells us to allow. We special-case it by
// checking the `.xterm` ancestor BEFORE the tag check.
function isEditableTargetExceptXterm(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el.closest('.xterm')) return false
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
  // Documented exceptions: SearchBar toggle and clipboard handlers must fire even
  // when xterm has focus (cf. `isEditableTargetExceptXterm`). Clipboard chords
  // use Ctrl+Shift+C/V (terminal convention) to avoid conflicts with SIGINT.
  const xtermAllowed: ReadonlySet<keyof KeybindingHandlers> = new Set([
    'toggleSearchBar',
    'copyFromTerminal',
    'pasteToTerminal',
  ])
  const guard = xtermAllowed.has(name) ? isEditableTargetExceptXterm : isEditableTarget
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
      '$mod+,': guardWithFocusRestore('toggleAppSettings', handlers.toggleAppSettings),
      '$mod+f': guardWithFocusRestore('toggleSearchBar', handlers.toggleSearchBar),
      '$mod+Shift+c': guardWithFocusRestore(
        'copyFromTerminal',
        handlers.copyFromTerminal ?? (() => {}),
      ),
      '$mod+Shift+v': guardWithFocusRestore(
        'pasteToTerminal',
        handlers.pasteToTerminal ?? (() => {}),
      ),
    }
    for (let n = 1; n <= 9; n += 1) {
      bindings[`$mod+Digit${n}`] = guardWithFocusRestore('jumpToSession', () =>
        handlers.jumpToSession(n - 1),
      )
    }
    // Capture-phase listener so the chord fires before xterm.js's
    // textarea-level keydown handler (which prevents default for keys it
    // captures). Without capture, Ctrl+F inside an xterm-focused pane
    // would never reach our toggle.
    return tinykeys(window, bindings, { capture: true })
  }, [handlers])
}
