import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'

const VARIANT: Record<Variant, string> = {
  primary:   'bg-p-accent text-p-accent-ink hover:bg-p-accent-deep',
  secondary: 'bg-p-surface text-p-text border border-p-border hover:bg-p-surface-2',
  ghost:     'bg-transparent text-p-accent-deep hover:bg-p-accent/10',
  danger:    'bg-p-danger/10 text-p-danger hover:bg-p-danger/15',
}

export function Button({
  variant = 'primary', size = 'md', loading = false, full = false, className = '', children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'md' | 'sm'; loading?: boolean; full?: boolean; children: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex items-center justify-center gap-2 font-semibold rounded-p-control p-lift
                  disabled:opacity-50 disabled:pointer-events-none
                  ${size === 'sm' ? 'text-xs px-3 min-h-9' : 'text-sm px-4 min-h-11'}
                  ${full ? 'w-full' : ''} ${VARIANT[variant]} ${className}`}
    >
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
