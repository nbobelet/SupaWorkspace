import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Mosaic, MosaicWindow, type MosaicNode } from 'react-mosaic-component'
import 'react-mosaic-component/react-mosaic-component.css'
import { TerminalPane } from './TerminalPane'
import { useSessionStore } from '../state/sessionStore'
import { useLayoutStore } from '../state/layoutStore'
import { CascadeLayout } from './CascadeLayout'

function buildSingleNode(sessionIds: readonly string[], activeId: string | null): MosaicNode<string> | null {
  if (sessionIds.length === 0) return null
  return activeId && sessionIds.includes(activeId) ? activeId : (sessionIds[0] ?? null)
}

function buildSplitNode(
  sessionIds: readonly string[],
  direction: 'row' | 'column',
): MosaicNode<string> | null {
  if (sessionIds.length === 0) return null
  if (sessionIds.length === 1) return sessionIds[0] ?? null
  const [a, b] = sessionIds
  if (!a || !b) return null
  return { direction, first: a, second: b, splitPercentage: 50 }
}

function buildGridNode(sessionIds: readonly string[]): MosaicNode<string> | null {
  if (sessionIds.length === 0) return null
  if (sessionIds.length === 1) return sessionIds[0] ?? null
  if (sessionIds.length === 2) {
    return buildSplitNode(sessionIds, 'row')
  }
  const half = Math.ceil(sessionIds.length / 2)
  const left = sessionIds.slice(0, half)
  const right = sessionIds.slice(half)
  const leftNode = buildColumnStack(left)
  const rightNode = buildColumnStack(right)
  if (!leftNode || !rightNode) return leftNode ?? rightNode
  return { direction: 'row', first: leftNode, second: rightNode, splitPercentage: 50 }
}

function buildColumnStack(ids: readonly string[]): MosaicNode<string> | null {
  if (ids.length === 0) return null
  if (ids.length === 1) return ids[0] ?? null
  const [head, ...rest] = ids
  if (!head) return null
  const tail = buildColumnStack(rest)
  if (!tail) return head
  return { direction: 'column', first: head, second: tail, splitPercentage: 100 / ids.length }
}

export function PaneMosaic(): ReactElement {
  const sessions = useSessionStore((s) => s.sessions)
  const order = useSessionStore((s) => s.order)
  const activeId = useSessionStore((s) => s.activeId)
  const setActive = useSessionStore((s) => s.setActive)
  const mode = useLayoutStore((s) => s.mode)

  const computedNode = useMemo(() => {
    switch (mode) {
      case 'single':
        return buildSingleNode(order, activeId)
      case 'split-horizontal':
        return buildSplitNode(order.slice(0, 2), 'row')
      case 'split-vertical':
        return buildSplitNode(order.slice(0, 2), 'column')
      case 'grid':
      default:
        return buildGridNode(order)
    }
  }, [mode, order, activeId])

  const [node, setNode] = useState<MosaicNode<string> | null>(computedNode)

  useEffect(() => {
    setNode(computedNode)
  }, [computedNode])

  if (order.length === 0) {
    return (
      <div className="grid h-full place-items-center text-muted">
        <div className="flex flex-col items-center gap-2 text-xs">
          <p>No sessions yet.</p>
          <p>Open a workspace, then spawn a shell or claude.</p>
        </div>
      </div>
    )
  }

  if (mode === 'cascade') {
    return <CascadeLayout />
  }

  if (mode === 'single') {
    const id = typeof node === 'string' ? node : null
    if (!id) return <div />
    return (
      <div className="h-full w-full p-2">
        <TerminalPane sessionId={id} isActive={id === activeId} onFocus={() => setActive(id)} />
      </div>
    )
  }

  return (
    <div className="mosaic-host h-full w-full" data-layout-mode={mode}>
      <Mosaic<string>
        value={node}
        onChange={(next) => setNode(next ?? null)}
        renderTile={(id, path) => {
          const s = sessions[id]
          if (!s) return <div />
          return (
            <MosaicWindow<string>
              path={path}
              title={s.label}
              toolbarControls={[]}
            >
              <TerminalPane sessionId={id} isActive={id === activeId} onFocus={() => setActive(id)} />
            </MosaicWindow>
          )
        }}
        className="mosaic-blueprint-theme bp-dark"
      />
    </div>
  )
}
