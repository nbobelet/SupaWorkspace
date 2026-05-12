import { useEffect, useRef, type KeyboardEvent, type ReactElement } from 'react'
import { useInputBarStore } from '../state/inputBarStore'
import { useSessionStore } from '../state/sessionStore'
import { focusSession } from '../hooks/useTerminalSession'

export function CommandInputBar(): ReactElement | null {
  const value = useInputBarStore((s) => s.value)
  const visible = useInputBarStore((s) => s.visible)
  const setValue = useInputBarStore((s) => s.setValue)
  const clear = useInputBarStore((s) => s.clear)
  const submit = useInputBarStore((s) => s.submit)
  const historyPrev = useInputBarStore((s) => s.historyPrev)
  const historyNext = useInputBarStore((s) => s.historyNext)
  const load = useInputBarStore((s) => s.load)

  const activeId = useSessionStore((s) => s.activeId)
  const activeLabel = useSessionStore((s) =>
    s.activeId ? (s.sessions[s.activeId]?.label ?? null) : null,
  )

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    void load()
  }, [load])

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

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (activeId) void submit(activeId)
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.currentTarget.blur()
      if (activeId) focusSession(activeId)
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
      data-testid="command-input-bar"
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
        aria-label="Command input bar — sends to active terminal"
      />
      <button
        type="button"
        onClick={() => activeId && void submit(activeId)}
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
