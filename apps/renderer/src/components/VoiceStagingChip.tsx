import { useEffect, useRef, useState, type ReactElement } from 'react'
import { useVoiceStore } from '../state/voiceStore'
import { focusActiveSession } from '../lib/sessionFocus'

/**
 * Staged-transcript review surface. A voice transcript lands here UN-SENT: the
 * user edits it, then Inserts (writes the text into the Claude prompt WITHOUT a
 * newline — still un-submitted, the user presses Enter in the terminal to send)
 * or Discards. Nothing reaches the PTY until Insert. This is the renderer-side
 * "input line" the council's `transcript_staged_unsent` calls for, since the
 * Claude TUI has no React composer of its own.
 */
export function VoiceStagingChip({ sessionId }: { sessionId: string }): ReactElement | null {
  const staged = useVoiceStore((s) => s.staged[sessionId])
  const clearStaged = useVoiceStore((s) => s.clearStaged)
  const [draft, setDraft] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (staged === undefined) return
    setDraft(staged)
    // Focus + select so the user can immediately edit or accept.
    const t = window.setTimeout(() => {
      textareaRef.current?.focus()
      textareaRef.current?.select()
    }, 0)
    return () => window.clearTimeout(t)
  }, [staged])

  if (staged === undefined) return null

  const discard = (): void => {
    clearStaged(sessionId)
    focusActiveSession(sessionId)
  }

  const insert = (): void => {
    const text = draft.trim()
    if (text.length > 0) {
      // No trailing carriage return: the text lands in Claude's input line
      // un-submitted. The user presses Enter to send.
      void window.ws.session.write({ sessionId, data: text })
    }
    clearStaged(sessionId)
    focusActiveSession(sessionId)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      discard()
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      insert()
    }
  }

  return (
    <div
      role="dialog"
      aria-label="Review voice transcript before inserting"
      className="absolute inset-x-2 bottom-2 z-40 rounded-md border border-border-strong bg-bg-elevated p-2 shadow-lg motion-safe:animate-in motion-safe:fade-in motion-safe:duration-100"
    >
      <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted">
        Voice transcript — review &amp; insert (Enter) · discard (Esc)
      </label>
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        className="supa-scroll w-full resize-none rounded border border-border bg-bg px-2 py-1 font-mono text-xs text-fg outline-none focus-visible:ring-1 focus-visible:ring-accent"
      />
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={discard}
          className="rounded px-2 py-0.5 text-xs text-muted hover:bg-bg hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={insert}
          className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          Insert
        </button>
      </div>
    </div>
  )
}
