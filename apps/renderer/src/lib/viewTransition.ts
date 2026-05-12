export function withViewTransition(callback: () => void): void {
  if (typeof document === 'undefined') {
    callback()
    return
  }
  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  if (reducedMotion || typeof document.startViewTransition !== 'function') {
    callback()
    return
  }
  document.startViewTransition(callback)
}
