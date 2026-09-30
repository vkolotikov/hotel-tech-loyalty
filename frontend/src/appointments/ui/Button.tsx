import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-a-accent text-a-accent-ink hover:bg-a-accent-deep',
  secondary: 'bg-a-surface text-a-text border border-a-border hover:bg-a-surface-2',
  ghost:     'bg-transparent text-a-accent-deep hover:bg-a-accent/10',
  danger:    'bg-a-danger text-a-accent-ink hover:bg-a-danger/90',
}

export function Button({
  variant = 'primary', size = 'md', loading = false, full = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold text-sm disabled:opacity-50 disabled:pointer-events-none ${size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2.5'} ${full ? 'w-full' : ''} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
