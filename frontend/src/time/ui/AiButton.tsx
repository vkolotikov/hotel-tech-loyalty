import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

/** The AI's own button: violet with white ink (time-ai-fill), the shape of the frame's primary button. */
export function AiButton({ loading = false, size = 'md', className = '', children, disabled, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; size?: 'md' | 'sm'; children: ReactNode }) {
  return (
    <button type="button" {...rest} disabled={disabled || loading} aria-busy={loading || undefined}
      className={`time-ai-fill inline-flex items-center justify-center gap-2 rounded-full text-sm font-semibold shadow-a-sm transition duration-150 hover:opacity-90 disabled:pointer-events-none disabled:opacity-50 ${size === 'sm' ? 'px-3 py-1.5' : 'px-4 py-2.5'} ${className}`}>
      {loading && <Loader2 size={15} className="animate-spin" aria-hidden />}
      {children}
    </button>
  )
}
