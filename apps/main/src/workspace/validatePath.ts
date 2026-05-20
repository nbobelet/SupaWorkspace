import { existsSync, statSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { z } from 'zod'

// why: getEffectiveCwd.ts has a local `usableDir` with identical semantics;
// it should later import this instead, but changing that file is out of scope.
export function isUsableDir(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isDirectory()
  } catch {
    return false
  }
}

export function resolveInput(input: string): string {
  return resolve(input)
}

export function resolveWithinBase(base: string, input: string): string {
  const resolvedBase = resolve(base)
  const resolvedTarget = resolve(resolvedBase, input)
  if (resolvedTarget !== resolvedBase && !resolvedTarget.startsWith(resolvedBase + sep)) {
    throw new Error(`Path traversal rejected: "${input}" resolves outside base "${resolvedBase}"`)
  }
  return resolvedTarget
}

export const SafeRelativePath = z
  .string()
  .refine((s) => !s.split(/[\\/]/).some((seg) => seg === '..'), {
    message: 'Path must not contain ".." segments',
  })
