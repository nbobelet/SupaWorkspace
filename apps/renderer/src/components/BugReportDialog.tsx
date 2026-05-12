import { useEffect, useRef, type ChangeEvent, type ReactElement } from 'react'
import { toast } from 'sonner'
import { useBugReportStore } from '../state/bugReportStore'
import type { BugReportSeverity } from '@shared/bugReport'

const SEVERITIES: readonly BugReportSeverity[] = ['low', 'medium', 'high', 'critical'] as const

function basename(p: string): string {
  const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
  return idx === -1 ? p : p.slice(idx + 1)
}

export function BugReportDialog(): ReactElement | null {
  const isOpen = useBugReportStore((s) => s.isOpen)
  const draft = useBugReportStore((s) => s.draft)
  const isSubmitting = useBugReportStore((s) => s.isSubmitting)
  const lastError = useBugReportStore((s) => s.lastError)
  const close = useBugReportStore((s) => s.close)
  const updateDraft = useBugReportStore((s) => s.updateDraft)
  const submit = useBugReportStore((s) => s.submit)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) titleRef.current?.focus()
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && !isSubmitting) {
        e.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen, isSubmitting, close])

  if (!isOpen) return null

  const trimmedTitle = draft.title.trim()
  const trimmedDesc = draft.description.trim()
  const canSubmit = trimmedTitle.length > 0 && trimmedDesc.length > 0 && !isSubmitting

  const onSubmit = async (): Promise<void> => {
    if (!canSubmit) return
    const res = await submit()
    if (res) {
      toast.success(`Bug report saved to ${basename(res.path)}`, {
        action: {
          label: 'Reveal',
          onClick: () => void window.ws.bugReport.revealDir(),
        },
      })
    } else {
      const message = useBugReportStore.getState().lastError ?? 'Failed to save bug report'
      toast.error(message)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-xl rounded-md border border-border bg-bg-elevated p-4 shadow-2xl">
        <h2 id="bug-report-title" className="text-sm font-semibold text-fg">
          Report a bug
        </h2>
        <p className="mt-1 text-xs text-fg-subtle">
          Saved as Markdown under <span className="font-mono">bug-reports/</span> at the project root.
        </p>

        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-subtle">Title</span>
            <input
              ref={titleRef}
              type="text"
              maxLength={200}
              value={draft.title}
              onChange={(e: ChangeEvent<HTMLInputElement>) => updateDraft({ title: e.target.value })}
              placeholder="Short summary"
              className="rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-subtle">Severity</span>
            <select
              value={draft.severity}
              onChange={(e: ChangeEvent<HTMLSelectElement>) =>
                updateDraft({ severity: e.target.value as BugReportSeverity })
              }
              className="rounded-sm border border-border bg-bg px-2 py-1.5 text-xs outline-none focus:border-accent"
            >
              {SEVERITIES.map((sev) => (
                <option key={sev} value={sev}>
                  {sev}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-subtle">Description</span>
            <textarea
              rows={4}
              value={draft.description}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateDraft({ description: e.target.value })
              }
              placeholder="What went wrong?"
              className="rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-subtle">Steps to reproduce (optional)</span>
            <textarea
              rows={3}
              value={draft.steps_to_reproduce}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateDraft({ steps_to_reproduce: e.target.value })
              }
              className="rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-subtle">Expected behavior (optional)</span>
            <textarea
              rows={2}
              value={draft.expected_behavior}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateDraft({ expected_behavior: e.target.value })
              }
              className="rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
          </label>

          <label className="flex flex-col gap-1 text-xs">
            <span className="text-fg-subtle">Actual behavior (optional)</span>
            <textarea
              rows={2}
              value={draft.actual_behavior}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                updateDraft({ actual_behavior: e.target.value })
              }
              className="rounded-sm border border-border bg-bg px-2 py-1.5 font-mono text-xs outline-none focus:border-accent"
            />
          </label>
        </div>

        {lastError && (
          <p className="mt-3 text-xs text-error" role="alert">
            {lastError}
          </p>
        )}

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="rounded-sm border border-border bg-bg-elevated px-3 py-1.5 text-xs hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel (Esc)
          </button>
          <button
            type="button"
            onClick={() => void onSubmit()}
            disabled={!canSubmit}
            className="rounded-sm border border-accent bg-accent/15 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? 'Saving…' : 'Save bug report'}
          </button>
        </div>
      </div>
    </div>
  )
}
