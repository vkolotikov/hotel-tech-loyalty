import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary:   'rounded-full bg-a-accent text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep [@media(hover:hover)]:hover:-translate-y-px',
  secondary: 'rounded-full bg-a-surface text-a-text border border-a-border hover:bg-a-surface-2',
  ghost:     'rounded-full bg-transparent text-a-accent-text hover:bg-a-accent/10',
  danger:    'rounded-full bg-a-danger text-a-danger-ink hover:bg-a-danger/90',
}

export function Button({
  variant = 'primary', size = 'md', loading = false, full = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold text-sm transition duration-150 disabled:opacity-50 disabled:pointer-events-none ${size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2.5'} ${full ? 'w-full' : ''} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
