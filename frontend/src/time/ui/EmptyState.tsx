import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** Nothing here yet: an icon, one sentence, a line and the one action that fills it. */
export function EmptyState({ icon: Icon, title, line, action }: { icon: LucideIcon; title: string; line?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <span aria-hidden className="grid h-12 w-12 place-items-center rounded-2xl bg-a-accent/12 text-a-accent-text"><Icon size={22} /></span>
      <p className="font-a-display text-xl text-a-text">{title}</p>
      {line && <p className="max-w-md text-sm text-a-text-2">{line}</p>}
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
