import { toast } from 'sonner'

/**
 * Fires a lightweight success toast confirming a clipboard copy action.
 * Uses sonner's built-in reduced-motion support — no manual media-query
 * handling required here.
 *
 * Duration is intentionally short (1 500 ms) so it does not compete with
 * the terminal output below it.
 */
export function showCopiedToast(): void {
  toast.success('Copied', { duration: 1500 })
}
