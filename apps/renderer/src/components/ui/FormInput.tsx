import { type InputHTMLAttributes } from 'react'

interface FormInputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Callers are responsible for associating a <label> via htmlFor + id. */
  id?: string
}

export function FormInput({ className = '', ...props }: FormInputProps) {
  const base =
    'h-7 w-full rounded-md border border-border bg-bg-elevated px-2.5 text-xs text-fg ' +
    'placeholder:text-muted ' +
    'focus:border-accent focus:outline-none ' +
    'disabled:cursor-not-allowed disabled:opacity-50 '
  return <input {...props} className={base + (className ? ' ' + className : '')} />
}
