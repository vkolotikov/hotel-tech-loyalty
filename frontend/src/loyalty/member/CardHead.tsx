import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * The head of a card on a member's page (release 9): an icon and a short title, and the card's own actions at the end
 * of the row. The title is the card's heading (`id` names it for the section's `aria-labelledby`).
 */
export function CardHead({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 id={id} className="flex min-w-0 items-center gap-2.5 text-[15px] font-semibold text-a-text">
        <span aria-hidden className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-a-accent/10 text-a-accent-text">
          <Icon size={16} />
        </span>
        <span className="min-w-0 truncate">{title}</span>
      </h2>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** A card on a member's page. */
export const CARD = 'space-y-4 rounded-2xl border border-a-border bg-a-surface p-5'

/** A round icon-only button (its name in `aria-label` and `title`): 44 px on a phone, 40 px from `sm`. */
export const ICON_BUTTON = 'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2 sm:h-10 sm:w-10'
