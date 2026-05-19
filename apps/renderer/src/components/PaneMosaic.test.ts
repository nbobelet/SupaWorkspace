import { describe, expect, it } from 'vitest'
import { SINGLE_MODE_WRAPPER_CLASS } from './PaneMosaic.layout'

describe('PaneMosaic single-mode wrapper', () => {
  it('must not introduce padding utilities — pre-fix `p-2` made TerminalPane smaller than the layout slot, so xterm FitAddon measured the inner box but rendered past the visible bordered wrapper', () => {
    expect(SINGLE_MODE_WRAPPER_CLASS).not.toMatch(/\bp[xytrbl]?-\d/)
  })

  it('fills the layout slot edge-to-edge like mosaic mode', () => {
    expect(SINGLE_MODE_WRAPPER_CLASS).toContain('h-full')
    expect(SINGLE_MODE_WRAPPER_CLASS).toContain('w-full')
  })
})
