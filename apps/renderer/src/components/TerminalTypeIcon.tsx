import type { ReactElement } from 'react'
import { Sparkles, Terminal, TerminalSquare } from 'lucide-react'
import type { SessionType } from '@shared/session'

interface TerminalTypeIconProps {
  type: SessionType
  size?: number
}

const LABEL: Record<SessionType, string> = {
  claude: 'claude',
  shell: 'shell',
  wsl: 'wsl',
}

export function TerminalTypeIcon({ type, size = 12 }: TerminalTypeIconProps): ReactElement {
  const label = LABEL[type]

  switch (type) {
    case 'claude':
      return <Sparkles size={size} aria-label={label} role="img" />
    case 'shell':
      return <Terminal size={size} aria-label={label} role="img" />
    case 'wsl':
      return <TerminalSquare size={size} aria-label={label} role="img" />
  }
}
