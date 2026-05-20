import { describe, expect, it } from 'vitest'
import type { ExplorerReadFileResponse } from '@shared/ipc'
import { extToLanguageName, shouldOfferLoadFull } from './preview-language'

describe('extToLanguageName', () => {
  it('maps common code extensions', () => {
    expect(extToLanguageName('index.ts')).toBe('typescript')
    expect(extToLanguageName('App.tsx')).toBe('tsx')
    expect(extToLanguageName('main.rs')).toBe('rust')
    expect(extToLanguageName('data.json')).toBe('json')
    expect(extToLanguageName('README.md')).toBe('markdown')
    expect(extToLanguageName('config.yml')).toBe('yaml')
  })

  it('is case-insensitive on the extension', () => {
    expect(extToLanguageName('Main.PY')).toBe('python')
    expect(extToLanguageName('STYLE.CSS')).toBe('css')
  })

  it('resolves the last extension for multi-dotted names', () => {
    expect(extToLanguageName('vite.config.ts')).toBe('typescript')
    expect(extToLanguageName('app.test.tsx')).toBe('tsx')
  })

  it('returns null for unknown extensions', () => {
    expect(extToLanguageName('archive.xyz')).toBeNull()
    expect(extToLanguageName('notes.unknown')).toBeNull()
  })

  it('returns null for extensionless and dotfile names', () => {
    expect(extToLanguageName('Makefile')).toBeNull()
    expect(extToLanguageName('.gitignore')).toBeNull()
    expect(extToLanguageName('.env')).toBeNull()
  })
})

describe('shouldOfferLoadFull', () => {
  const base = { size: 10 }

  it('is true only for truncated text', () => {
    const truncated: ExplorerReadFileResponse = {
      status: 'text',
      content: 'x',
      encoding: 'utf8',
      truncated: true,
      ...base,
    }
    expect(shouldOfferLoadFull(truncated)).toBe(true)
  })

  it('is false for untruncated text', () => {
    const whole: ExplorerReadFileResponse = {
      status: 'text',
      content: 'x',
      encoding: 'utf8',
      truncated: false,
      ...base,
    }
    expect(shouldOfferLoadFull(whole)).toBe(false)
  })

  it('is false for non-text statuses', () => {
    expect(shouldOfferLoadFull({ status: 'binary', size: 10 })).toBe(false)
    expect(
      shouldOfferLoadFull({ status: 'image', dataUrl: 'data:', mime: 'image/png', size: 10 }),
    ).toBe(false)
    expect(shouldOfferLoadFull({ status: 'needs-grant', path: '/x' })).toBe(false)
  })
})
