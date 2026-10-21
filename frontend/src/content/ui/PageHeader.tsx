import type { ReactNode } from 'react'
import { PageHeader as Frame } from '../../workspace/ui/PageHeader'
import { NewPostButton } from './NewPostButton'

/**
 * A Content page's header (spec 2026-10-21 §5): the shared header's title, line and what goes under it, and the page's
 * actions at the end of the row — New post where the page offers it (Plan, Ideas, Posts).
 */
export function PageHeader({ title, line, below, newPost = false, children }: {
  title: string
  line?: string
  below?: ReactNode
  newPost?: boolean
  children?: ReactNode
}) {
  return (
    <Frame title={title} line={line} below={below}>
      {(children || newPost) && <>
        {children}
        {newPost && <NewPostButton />}
      </>}
    </Frame>
  )
}
