import type { ReactNode } from 'react'

/** A page's title in the display face, with its actions (or a figure) at the end of the row. */
export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <h1 className="font-a-display text-2xl font-normal leading-tight text-a-text">{title}</h1>
      {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}
