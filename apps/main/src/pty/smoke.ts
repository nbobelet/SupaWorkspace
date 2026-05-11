import { spawn as ptySpawn } from '@homebridge/node-pty-prebuilt-multiarch'

export async function runPtySmoke(): Promise<boolean> {
  const isWindows = process.platform === 'win32'
  const shell = isWindows ? 'cmd.exe' : '/bin/sh'
  const args = isWindows ? ['/c', 'echo hello-pty'] : ['-c', 'echo hello-pty']

  return new Promise((resolve) => {
    let buffer = ''
    let resolved = false

    const finish = (ok: boolean): void => {
      if (resolved) return
      resolved = true
      resolve(ok)
    }

    const timer = setTimeout(() => {
      console.error('[pty] smoke timed out after 5s; buffer:', JSON.stringify(buffer))
      finish(false)
    }, 5000)

    try {
      const pty = ptySpawn(shell, args, {
        name: 'xterm-256color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
      })

      pty.onData((data) => {
        buffer += data
        if (buffer.includes('hello-pty')) {
          clearTimeout(timer)
          console.log('[pty] hello world ok')
          try {
            pty.kill()
          } catch {
            // already exited
          }
          finish(true)
        }
      })

      pty.onExit(({ exitCode }) => {
        clearTimeout(timer)
        if (buffer.includes('hello-pty')) {
          console.log('[pty] hello world ok (exit', exitCode, ')')
          finish(true)
        } else {
          console.error('[pty] exit before match; code=', exitCode, 'buffer=', JSON.stringify(buffer))
          finish(false)
        }
      })
    } catch (err) {
      clearTimeout(timer)
      console.error('[pty] smoke spawn failed:', err)
      finish(false)
    }
  })
}
