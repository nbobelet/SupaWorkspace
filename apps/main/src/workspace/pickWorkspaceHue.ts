export const PALETTE_HUES: readonly number[] = [15, 45, 95, 145, 195, 230, 270, 310]

export function angularDistance(a: number, b: number): number {
  const diff = Math.abs(a - b) % 360
  return diff > 180 ? 360 - diff : diff
}

export function pickWorkspaceHue(existingHues: readonly number[]): number {
  if (existingHues.length === 0) {
    return PALETTE_HUES[0] as number
  }

  let bestHue = PALETTE_HUES[0] as number
  let bestMinGap = -1
  for (const candidate of PALETTE_HUES) {
    let minGap = Number.POSITIVE_INFINITY
    for (const used of existingHues) {
      const gap = angularDistance(candidate, used)
      if (gap < minGap) minGap = gap
    }
    if (minGap > bestMinGap) {
      bestMinGap = minGap
      bestHue = candidate
    }
  }
  return bestHue
}
