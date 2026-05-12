import { useEffect, useRef, type ReactElement } from 'react'
import { useCmdGuardStore } from '../state/cmdGuardStore'

export function CmdGuardModal(): ReactElement | null {
  const pending = useCmdGuardStore((s) => s.pending)
  const decide = useCmdGuardStore((s) => s.decide)
  const denyButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (pending) {
      denyButtonRef.current?.focus()
    }
  }, [pending])

  useEffect(() => {
    if (!pending) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault()
        void decide(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [pending, decide])

  if (!pending) return null

  return (
    <div
      role="alertdialog"
      aria-labelledby="cmd-guard-title"
      aria-describedby="cmd-guard-desc"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-lg rounded-md border border-warn bg-bg-elevated p-4 shadow-2xl">
        <h2 id="cmd-guard-title" className="text-sm font-semibold text-warn">
          Sensitive command — confirm before execution
        </h2>
        <p id="cmd-guard-desc" className="mt-1 text-xs text-fg-subtle">
          Matched rule: <span className="font-medium text-fg">{pending.rule.description}</span>
        </p>
        <pre className="mt-3 max-h-48 overflow-auto rounded-sm border border-border bg-bg px-2 py-2 font-mono text-xs text-fg whitespace-pre-wrap break-words">
          {pending.cmd}
        </pre>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            ref={denyButtonRef}
            type="button"
            onClick={() => void decide(false)}
            className="rounded-sm border border-border bg-bg-elevated px-3 py-1.5 text-xs hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={() => void decide(true)}
            className="rounded-sm border border-warn bg-warn/15 px-3 py-1.5 text-xs font-medium text-warn hover:bg-warn/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-warn"
          >
            Run anyway
          </button>
        </div>
      </div>
    </div>
  )
}
