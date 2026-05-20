import { open, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import type { ExplorerReadFileResponse } from '@shared/ipc'
import { clampToScope } from './list-dir'

/**
 * Cap on bytes decoded for a text preview. Beyond this the response is flagged
 * `truncated` and the renderer offers "Load full file" (which re-requests with
 * `full: true`). Keeps a pathological multi-MB log off the IPC channel by
 * default while still showing the head.
 */
const HEAD_CAP = 256 * 1024

/**
 * Images are base64'd whole into a data URL — there is no partial render — so a
 * hard ceiling stops a huge asset from ballooning the IPC payload (~4/3 its
 * byte size once encoded). Over this, we report `binary` instead.
 */
const IMAGE_CAP = 10 * 1024 * 1024

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

/**
 * Read one file for the Explorer preview panel.
 *
 * Security: clamps `relPath` to `rootPath` with the same `..`/symlink-realpath
 * defense as the directory listing (`list-dir.clampToScope`). Out-of-scope
 * paths return a structured `needs-grant` rather than throwing.
 *
 * Classification: image extensions (within `IMAGE_CAP`) become a base64 data
 * URL; a null byte in the read head means binary; everything else is decoded
 * UTF-8 text, capped at `HEAD_CAP` unless `full` is set.
 */
export async function readFile(
  rootPath: string,
  relPath: string,
  full: boolean,
): Promise<ExplorerReadFileResponse> {
  const abs = await clampToScope(rootPath, relPath)
  if (abs === null) {
    return { status: 'needs-grant', path: resolve(rootPath, relPath) }
  }

  const info = await stat(abs)
  if (!info.isFile()) return { status: 'binary', size: 0 }
  const size = info.size

  const mime = IMAGE_MIME[extname(abs).toLowerCase()]
  if (mime) {
    if (size > IMAGE_CAP) return { status: 'binary', size }
    const bytes = await readBytes(abs, size)
    return {
      status: 'image',
      dataUrl: `data:${mime};base64,${bytes.toString('base64')}`,
      mime,
      size,
    }
  }

  const limit = full ? size : Math.min(size, HEAD_CAP)
  const head = await readBytes(abs, limit)
  // A NUL byte in the head is the cheap, reliable binary tell (matches what
  // git's own "is this a text file" heuristic keys on).
  if (head.includes(0)) return { status: 'binary', size }

  return {
    status: 'text',
    content: head.toString('utf8'),
    encoding: 'utf8',
    truncated: !full && size > HEAD_CAP,
    size,
  }
}

/** Read at most `length` bytes from the start of `abs`. */
async function readBytes(abs: string, length: number): Promise<Buffer> {
  if (length <= 0) return Buffer.alloc(0)
  const handle = await open(abs, 'r')
  try {
    const buf = Buffer.alloc(length)
    const { bytesRead } = await handle.read(buf, 0, length, 0)
    return buf.subarray(0, bytesRead)
  } finally {
    await handle.close()
  }
}
