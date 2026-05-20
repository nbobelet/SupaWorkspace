import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFile } from './read-file'

const HEAD_CAP = 256 * 1024

describe('readFile', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'explorer-read-'))
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('rejects a `..` escape with needs-grant', async () => {
    const res = await readFile(root, '../secret.txt', false)
    expect(res.status).toBe('needs-grant')
  })

  it('reads a small text file in full and reports its size', async () => {
    writeFileSync(join(root, 'a.ts'), 'export const x = 1\n')
    const res = await readFile(root, 'a.ts', false)
    expect(res.status).toBe('text')
    if (res.status !== 'text') return
    expect(res.content).toBe('export const x = 1\n')
    expect(res.truncated).toBe(false)
    expect(res.encoding).toBe('utf8')
    expect(res.size).toBe(19)
  })

  it('truncates a large text file to the head cap and flags truncated', async () => {
    const big = 'x'.repeat(HEAD_CAP + 5000)
    writeFileSync(join(root, 'big.txt'), big)
    const res = await readFile(root, 'big.txt', false)
    expect(res.status).toBe('text')
    if (res.status !== 'text') return
    expect(res.truncated).toBe(true)
    expect(res.content.length).toBe(HEAD_CAP)
    expect(res.size).toBe(big.length)
  })

  it('returns the whole file (no truncation) when full=true', async () => {
    const big = 'y'.repeat(HEAD_CAP + 5000)
    writeFileSync(join(root, 'big.txt'), big)
    const res = await readFile(root, 'big.txt', true)
    expect(res.status).toBe('text')
    if (res.status !== 'text') return
    expect(res.truncated).toBe(false)
    expect(res.content.length).toBe(big.length)
  })

  it('encodes an image as a data URL with its mime', async () => {
    // 1x1 transparent PNG.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    writeFileSync(join(root, 'pixel.png'), png)
    const res = await readFile(root, 'pixel.png', false)
    expect(res.status).toBe('image')
    if (res.status !== 'image') return
    expect(res.mime).toBe('image/png')
    expect(res.dataUrl.startsWith('data:image/png;base64,')).toBe(true)
    expect(res.size).toBe(png.length)
  })

  it('classifies a file with a null byte as binary', async () => {
    writeFileSync(join(root, 'blob.bin'), Buffer.from([0x01, 0x00, 0x02, 0x03]))
    const res = await readFile(root, 'blob.bin', false)
    expect(res.status).toBe('binary')
    if (res.status !== 'binary') return
    expect(res.size).toBe(4)
  })

  it('treats an empty file as empty text, not binary', async () => {
    writeFileSync(join(root, 'empty.txt'), '')
    const res = await readFile(root, 'empty.txt', false)
    expect(res.status).toBe('text')
    if (res.status !== 'text') return
    expect(res.content).toBe('')
    expect(res.size).toBe(0)
  })
})
