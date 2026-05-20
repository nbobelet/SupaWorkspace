import { useMemo, type ReactElement } from 'react'
import CodeMirror, { type Extension } from '@uiw/react-codemirror'
import { loadLanguage } from '@uiw/codemirror-extensions-langs'
import { FileQuestion, ShieldAlert } from 'lucide-react'
import type { ExplorerReadFileResponse } from '@shared/ipc'
import type { PreviewState } from './useExplorer'
import { extToLanguageName, shouldOfferLoadFull } from './preview-language'

interface FilePreviewProps {
  fileName: string
  preview: PreviewState
  onLoadFull: () => void
}

/**
 * Content preview region of the Explorer's rightmost panel. Switches on the
 * fetch state: a skeleton while loading, then text (CodeMirror read-only, syntax
 * highlighted), an inline image, a binary notice, or an out-of-scope notice.
 */
export function FilePreview({ fileName, preview, onLoadFull }: FilePreviewProps): ReactElement {
  if (preview.kind === 'loading') return <PreviewSkeleton />
  if (preview.kind === 'idle') {
    return <Notice icon={<FileQuestion size={20} aria-hidden="true" />} text="No preview." />
  }
  if (preview.kind === 'error') {
    return <Notice tone="error" text={`Preview failed: ${preview.message}`} />
  }
  return <LoadedPreview fileName={fileName} result={preview.result} onLoadFull={onLoadFull} />
}

function LoadedPreview({
  fileName,
  result,
  onLoadFull,
}: {
  fileName: string
  result: ExplorerReadFileResponse
  onLoadFull: () => void
}): ReactElement {
  // loadLanguage is synchronous (grammars are bundled) and returns null for an
  // unknown name, so an unmapped extension safely falls back to plain text.
  const extensions = useMemo<Extension[]>(() => {
    const name = extToLanguageName(fileName)
    const lang = name ? loadLanguage(name as Parameters<typeof loadLanguage>[0]) : null
    return lang ? [lang] : []
  }, [fileName])

  if (result.status === 'image') {
    return (
      <div className="supa-scroll flex h-full items-center justify-center overflow-auto p-3">
        <img
          src={result.dataUrl}
          alt={fileName}
          className="max-h-full max-w-full object-contain"
          style={{ imageRendering: 'auto' }}
        />
      </div>
    )
  }

  if (result.status === 'binary') {
    return (
      <Notice
        icon={<FileQuestion size={20} aria-hidden="true" />}
        text="No preview available for this file type."
      />
    )
  }

  if (result.status === 'needs-grant') {
    return (
      <Notice
        tone="warn"
        icon={<ShieldAlert size={20} aria-hidden="true" />}
        text="This file is outside the workspace scope."
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {shouldOfferLoadFull(result) && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-warn/10 px-3 py-1.5">
          <span className="text-[11px] text-warn">Showing first 256 KB</span>
          <button
            type="button"
            onClick={onLoadFull}
            className="shrink-0 rounded-sm border border-accent bg-accent/10 px-2 py-0.5 text-[11px] font-semibold text-accent hover:bg-accent/20"
          >
            Load full file
          </button>
        </div>
      )}
      <div className="supa-scroll min-h-0 flex-1 overflow-auto">
        <CodeMirror
          value={result.content}
          readOnly
          editable={false}
          theme="dark"
          height="100%"
          extensions={extensions}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
          style={{ height: '100%', fontSize: 12, background: 'transparent' }}
        />
      </div>
    </div>
  )
}

function PreviewSkeleton(): ReactElement {
  return (
    <div aria-hidden="true" className="flex flex-col gap-2 p-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <span
          key={i}
          className="h-3 animate-pulse rounded-sm bg-fg/10 motion-reduce:animate-none"
          style={{ width: `${85 - (i % 3) * 18}%` }}
        />
      ))}
    </div>
  )
}

function Notice({
  text,
  icon,
  tone = 'muted',
}: {
  text: string
  icon?: ReactElement
  tone?: 'muted' | 'warn' | 'error'
}): ReactElement {
  const color = tone === 'error' ? 'text-error' : tone === 'warn' ? 'text-warn' : 'text-muted'
  return (
    <div
      className={`flex h-full flex-col items-center justify-center gap-2 px-4 text-center ${color}`}
    >
      {icon}
      <p className="text-xs">{text}</p>
    </div>
  )
}
