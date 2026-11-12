import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { InfoTip } from './InfoTip'

/**
 * A CRM page: its header and its body, with the frame's gutters (16 px on a phone). Round 5 (owner 2026-11-12, "minimize
 * copy … more icons"): one compact row — the area's icon, the title, an (i) holding `line` (what the page is for), and the
 * page's actions at the end; `below` (a page's chips) under it. `wide` lets a board or a split view use the whole width;
 * `flush` drops the body's gutters for a page that fills the screen (the inbox).
 */
export function Page({ title, line, icon: Icon, actions, below, wide = false, flush = false, children }: {
  title: string
  line?: string
  icon?: LucideIcon
  actions?: ReactNode
  below?: ReactNode
  wide?: boolean
  flush?: boolean
  children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full ${flush ? 'flex h-full min-h-0 flex-col gap-3 px-3 py-3 lg:px-4' : 'space-y-4 px-4 py-4 lg:px-6 lg:py-5'} ${wide || flush ? 'max-w-none' : 'max-w-6xl'}`}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {Icon && <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-surface-2 text-a-text"><Icon size={18} /></span>}
          <h1 className="min-w-0 truncate font-a-display text-[28px] font-normal leading-tight text-a-text lg:text-[30px]">{title}</h1>
          {line && <InfoTip text={line} />}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        {below && <div className="w-full min-w-0">{below}</div>}
      </header>
      {children}
    </div>
  )
}
