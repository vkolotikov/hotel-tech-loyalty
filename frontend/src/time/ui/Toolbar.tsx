import type { ReactNode } from 'react'
import { X } from 'lucide-react'

/**
 * A list's controls in one place (round 2): the search and the filters on the left, the view switch and the list's
 * actions on the right; one row on a wide screen, stacked on a phone. Active filters show under it as chips.
 */
export function Toolbar({ children, actions, chips }: { children: ReactNode; actions?: ReactNode; chips?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 rounded-2xl border border-a-border bg-a-surface p-2 shadow-a-sm sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {chips && <div className="flex flex-wrap items-center gap-1.5">{chips}</div>}
    </div>
  )
}

/** One active filter, removable at a press ("Stage: Proposal ×"). */
export function FilterChip({ label, onRemove, removeLabel }: { label: string; onRemove: () => void; removeLabel: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-a-border bg-a-surface-2 py-0.5 pl-2.5 pr-1 text-xs text-a-text">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${removeLabel}: ${label}`} className="rounded-full p-0.5 text-a-text-2 hover:bg-a-surface hover:text-a-text">
        <X size={12} aria-hidden />
      </button>
    </span>
  )
}
