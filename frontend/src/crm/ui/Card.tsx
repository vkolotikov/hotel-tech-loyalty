import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** A raised card: a title with an icon and an action at the end of its row, then its body. */
export function Card({ title, icon: Icon, action, padded = true, className = '', children }: {
  title?: string
  icon?: LucideIcon
  action?: ReactNode
  padded?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-a-border bg-a-surface shadow-a-sm ${className}`}>
      {(title || action) && (
        <div className="flex min-h-12 items-center gap-2 border-b border-a-border px-4 py-2.5">
          {Icon && <Icon size={16} aria-hidden className="shrink-0 text-a-text-2" />}
          {title && <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-a-text">{title}</h2>}
          {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={padded ? 'p-4' : ''}>{children}</div>
    </section>
  )
}
