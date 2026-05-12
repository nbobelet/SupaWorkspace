import { z } from 'zod'

/**
 * Renderer-boundary schema for xterm.js Terminal constructor options.
 * Validated once at module load with `TerminalOptionsZ.parse(defaults)` so a
 * malformed config object surfaces as a sonner toast instead of silently
 * misconfiguring the terminal.
 */
export const TerminalOptionsZ = z.object({
  font: z.object({
    family: z.string(),
    size: z.number().int(),
    weight: z.number().int().optional(),
    letterSpacing: z.number().optional(),
    lineHeight: z.number().optional(),
  }),
  cursor: z.object({
    style: z.enum(['block', 'underline', 'bar']),
    inactiveStyle: z.enum(['outline', 'block', 'bar', 'underline', 'none']),
    blink: z.boolean(),
  }),
  scrollback: z.number().int().min(0),
  minimumContrastRatio: z.number().min(1),
  customGlyphs: z.boolean(),
  smoothScrollDuration: z.number().int().min(0),
})

export type TerminalOptions = z.infer<typeof TerminalOptionsZ>
