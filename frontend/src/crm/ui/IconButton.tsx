import type { ButtonHTMLAttributes } from 'react'
import { Link } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'

/**
 * Round 5 (owner 2026-11-12, "more icons"): an action shown as its icon alone, its name as the tooltip and for a screen
 * reader. `tone` colours the icon (danger for delete); `to` makes it a link; `href` a link out (mailto:, tel:).
 */
export function IconButton({ icon: Icon, label, tone = 'neutral', size = 'md', to, href, className = '', ...rest }: {
  icon: LucideIcon
  label: string
  tone?: 'neutral' | 'accent' | 'danger'
  size?: 'sm' | 'md'
  to?: string
  href?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>) {
  const box = size === 'sm' ? 'h-8 w-8' : 'h-9 w-9'
  const colour = tone === 'danger' ? 'text-a-danger hover:bg-a-danger/10' : tone === 'accent' ? 'text-a-accent-text hover:bg-a-accent/10' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'
  const cls = `inline-grid ${box} shrink-0 place-items-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-a-accent disabled:cursor-not-allowed disabled:opacity-40 ${colour} ${className}`
  const icon = <Icon size={size === 'sm' ? 15 : 17} aria-hidden />
  if (to) return <Link to={to} aria-label={label} title={label} className={cls}>{icon}</Link>
  if (href) return <a href={href} aria-label={label} title={label} className={cls}>{icon}</a>
  return <button type="button" aria-label={label} title={label} className={cls} {...rest}>{icon}</button>
}
