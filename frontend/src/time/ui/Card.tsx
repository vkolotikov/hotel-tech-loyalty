import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { TONE_CHIP, type Tone } from './tones'

/**
 * A raised card: a title with its icon (in a tone's chip when `tone` is set), one line of what it holds, an action at
 * the end of its row, then its body.
 */
export function Card({ title, description, icon: Icon, tone, action, padded = true, className = '', children }: {
  title?: string
  description?: string
  icon?: LucideIcon
  tone?: Tone
  action?: ReactNode
  padded?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-a-border bg-a-surface shadow-a-sm ${className}`}>
      {(title || action) && (
        <div className="flex min-h-12 items-center gap-2.5 border-b border-a-border px-4 py-2.5">
          {Icon && (tone
            ? <span aria-hidden className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon size={15} /></span>
            : <Icon size={16} aria-hidden className="shrink-0 text-a-text-2" />)}
          {title && (
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-semibold text-a-text">{title}</h2>
              {description && <p className="truncate text-xs text-a-text-2">{description}</p>}
            </div>
          )}
          {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}
