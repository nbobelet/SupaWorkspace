import { type ButtonHTMLAttributes } from 'react'

export type ButtonVariant = 'primary' | 'ghost' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'border-accent bg-accent/10 text-accent hover:bg-accent/20',
  ghost: 'border-border bg-bg-elevated text-fg hover:border-border-strong',
  danger: 'border-error bg-error/10 text-error hover:bg-error/20',
}

export function Button({ variant = 'ghost', className = '', ...props }: ButtonProps) {
  const base =
    'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ' +
    'disabled:cursor-not-allowed disabled:opacity-50 '
  return (
    <button
      type="button"
      {...props}
      className={base + variantClasses[variant] + (className ? ' ' + className : '')}
    />
  )
}
