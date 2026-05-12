import {
  useEffect,
  useRef,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react'
import { useSessionCommandBarStore } from '../state/sessionCommandBarStore'
import { useSessionStore } from '../state/sessionStore'
import { returnFocusToActiveSession } from '../lib/commandBarFocus'

const PASTE_GUARD_MS = 50

// Session-scoped command bar — sends text to the ACTIVE xterm session.
//
// Focus discipline:
// - Bar NEVER auto-focuses on mount or visibility change. The xterm-always
//   invariant means typing falls through to the active terminal by default.
// - Bar only receives focus when the user explicitly asks for it via the
//   `session-command-bar:focus-request` channel (bound to $mod+i).
// - On submit OR Escape, focus returns to the active xterm via
//   `returnFocusToActiveSession()`. Never falls back to document.body.
export function SessionCommandBar(): ReactElement | null {
  const value = useSessionCommandBarStore((s) => s.value)
  const visible = useSessionCommandBarStore((s) => s.visible)
  const setValue = useSessionCommandBarStore((s) => s.setValue)
  const clear = useSessionCommandBarStore((s) => s.clear)
  const submit = useSessionCommandBarStore((s) => s.submit)
  const historyPrev = useSessionCommandBarStore((s) => s.historyPrev)
  const historyNext = useSessionCommandBarStore((s) => s.historyNext)
  const load = useSessionCommandBarStore((s) => s.load)

  const activeId = useSessionStore((s) => s.activeId)
  const activeLabel = useSessionStore((s) =>
    s.activeId ? (s.sessions[s.activeId]?.label ?? null) : null,
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const lastPasteAtRef = useRef<number>(0)

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const handler = (): void => {
      const el = textareaRef.current
      if (el) requestAnimationFrame(() => el.focus())
    }
    window.addEventListener('session-command-bar:focus-request', handler)
    return () => window.removeEventListener('session-command-bar:focus-request', handler)
  }, [visible])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [value, visible])

  if (!visible) return null

  const isMultiline = value.includes('\n')
  const disabled = !activeId
  const placeholder = activeId
    ? `Send to ${activeLabel ?? activeId.slice(0, 8)} — Enter to submit, Shift+Enter for newline`
    : 'No active session — focus a tab first'

  const onPaste = (_e: ClipboardEvent<HTMLTextAreaElement>): void => {
    lastPasteAtRef.current = Date.now()
  }

  const handleSubmit = async (): Promise<void> => {
    if (!activeId) return
    await submit(activeId)
    returnFocusToActiveSession()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Enter' && !e.shiftKey) {
      if (Date.now() - lastPasteAtRef.current < PASTE_GUARD_MS) {
        e.preventDefault()
        return
      }
      e.preventDefault()
      void handleSubmit()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.currentTarget.blur()
      returnFocusToActiveSession()
      return
    }
    if ((e.key === 'l' || e.key === 'L') && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      clear()
      return
    }
    if (e.key === 'ArrowUp' && !isMultiline) {
      const isAtStart = e.currentTarget.selectionStart === 0
      if (isAtStart || value.length === 0) {
        e.preventDefault()
        historyPrev()
      }
      return
    }
    if (e.key === 'ArrowDown' && !isMultiline) {
      const isAtEnd = e.currentTarget.selectionStart === value.length
      if (isAtEnd || value.length === 0) {
        e.preventDefault()
        historyNext()
      }
    }
  }

  return (
    <div
      className={[
        'flex items-end gap-2 border-t border-border bg-bg-sunken px-3 py-2',
        'focus-within:border-accent',
      ].join(' ')}
      data-testid="session-command-bar"
      data-region="session"
      role="region"
      aria-label="Active session input"
    >
      <span
        className="shrink-0 select-none font-mono text-xs text-fg-subtle"
        aria-hidden="true"
      >
        ›
      </span>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        disabled={disabled}
        placeholder={placeholder}
        rows={1}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        className={[
          'min-h-[44px] flex-1 resize-none rounded-sm border border-border bg-bg px-2 py-2',
          'font-mono text-sm leading-tight text-fg outline-none',
          'placeholder:text-muted',
          'focus:border-accent focus:ring-1 focus:ring-accent/40',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
        aria-label="Session command input — sends to active terminal"
      />
      <button
        type="button"
        onClick={() => void handleSubmit()}
        disabled={disabled || value.length === 0}
        className={[
          'h-9 shrink-0 rounded-sm border border-accent bg-accent/10 px-3 text-xs font-medium text-accent',
          'hover:bg-accent/20',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
          'disabled:cursor-not-allowed disabled:opacity-50',
        ].join(' ')}
        aria-label="Send command"
      >
        Send
      </button>
    </div>
  )
}
