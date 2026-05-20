import type { ExplorerReadFileResponse } from '@shared/ipc'

/**
 * File extension → `@uiw/codemirror-extensions-langs` language name. The names
 * are passed to `loadLanguage`, which returns the CodeMirror `LanguageSupport`
 * (or null for an unknown name). Unknown extensions map to null → plain text,
 * no highlighting. Keep this list to languages the preview actually meets;
 * `loadLanguage` already no-ops gracefully on a miss.
 */
const EXT_LANGUAGE: Record<string, string> = {
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  scss: 'sass',
  less: 'less',
  html: 'html',
  htm: 'html',
  xml: 'xml',
  vue: 'vue',
  svelte: 'svelte',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  c: 'c',
  h: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  cxx: 'cpp',
  hpp: 'cpp',
  cs: 'csharp',
  php: 'php',
  rb: 'ruby',
  swift: 'swift',
  sh: 'shell',
  bash: 'shell',
  zsh: 'shell',
  yaml: 'yaml',
  yml: 'yaml',
  toml: 'toml',
  sql: 'sql',
  dockerfile: 'dockerfile',
}

/**
 * Resolve a CodeMirror language name from a filename, or null when there is no
 * mapping (the preview falls back to plain, unhighlighted text). Case- and
 * leading-dot-insensitive; dotfiles with no extension (e.g. `.gitignore`) yield
 * null.
 */
export function extToLanguageName(filename: string): string | null {
  const dot = filename.lastIndexOf('.')
  // No dot, or a leading-dot dotfile with nothing after it (".gitignore").
  if (dot <= 0) return null
  const ext = filename.slice(dot + 1).toLowerCase()
  return EXT_LANGUAGE[ext] ?? null
}

/** True when the preview is truncated text and the UI should offer "Load full file". */
export function shouldOfferLoadFull(result: ExplorerReadFileResponse): boolean {
  return result.status === 'text' && result.truncated
}
