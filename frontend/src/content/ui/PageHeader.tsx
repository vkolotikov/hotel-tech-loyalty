import type { ReactNode } from 'react'
import { NewPostButton } from './NewPostButton'

/**
 * A page's header (spec 2026-10-21 §5): its title in the display face, a line beside it (under it on a phone) and what
 * goes under that line (the Plan's numbers), and the page's actions at the end of the row — New post where the page
 * offers it (Plan, Ideas, Posts).
 */
export function PageHeader({ title, line, below, newPost = false, children }: {
  title: string
  line?: string
  below?: ReactNode
  newPost?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
      <h1 className="font-a-display text-[40px] font-normal leading-none text-a-text">{title}</h1>
      {(line || below) && (
        <div className="min-w-0 space-y-1 pt-1.5">
          {line && <p className="text-sm text-a-text-2">{line}</p>}
          {below}
        </div>
      )}
      {(children || newPost) && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {children}
          {newPost && <NewPostButton />}
        </div>
      )}
    </div>
  )
}
