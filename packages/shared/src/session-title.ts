import { z } from 'zod'

export const SessionTitleConfig = z.object({
  maxWords: z.number().int().min(1).max(20).default(6),
  maxLen: z.number().int().min(10).max(80).default(40),
})
export type SessionTitleConfig = z.infer<typeof SessionTitleConfig>

export function generateSessionTitle(
  prompt: string,
  config?: Partial<{ maxWords: number; maxLen: number }>,
): string {
  const { maxWords, maxLen } = SessionTitleConfig.parse({
    maxWords: config?.maxWords,
    maxLen: config?.maxLen,
  })

  const tokens = prompt
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0 && !t.startsWith('-'))

  if (tokens.length === 0) return 'claude'

  const words = tokens.slice(0, maxWords)
  const joined = words.join(' ')
  const titled = joined.charAt(0).toUpperCase() + joined.slice(1)
  return titled.slice(0, maxLen)
}
