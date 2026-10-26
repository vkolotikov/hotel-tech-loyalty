import type { ReactNode } from 'react'

/**
 * A page's header in the cards frame (spec 2026-10-21 §5): its title in the display face, a line beside it (under it on
 * a phone) and what goes under that line (a page's numbers), and the page's actions at the end of the row. `stacked`
 * (HexaTech Loyalty release 10, the owner's drafts) sets the line under the title on every screen, a page's sentence
 * of what it is for; without it the header is as it was.
 */
export function PageHeader({ title, line, below, stacked = false, children }: {
  title: string
  line?: string
  below?: ReactNode
  stacked?: boolean
  children?: ReactNode
}) {
  if (stacked) {
    return (
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl space-y-2">
          <h1 className="font-a-display text-[40px] font-normal leading-none text-a-text">{title}</h1>
          {line && <p className="text-sm text-a-text-2 sm:text-base">{line}</p>}
          {below}
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <h1 className="font-a-display text-[40px] font-normal leading-none text-a-text">{title}</h1>
      {(line || below) && (
        <div className="min-w-0 space-y-1 pt-1.5">
          {line && <p className="text-sm text-a-text-2">{line}</p>}
          {below}
        </div>
      )}
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
