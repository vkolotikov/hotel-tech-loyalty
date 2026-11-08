import type { ReactNode } from 'react'
import { PageHeader } from '../../workspace/ui/PageHeader'

/**
 * A CRM page: its header (title in the display face, one line of what it is for, its actions) and its body, with the
 * frame's gutters (16 px on a phone). `wide` lets a board or a split view use the whole width.
 */
export function Page({ title, line, actions, below, wide = false, children }: {
  title: string
  line?: string
  actions?: ReactNode
  below?: ReactNode
  wide?: boolean
  children: ReactNode
}) {
  return (
    <div className={`mx-auto w-full space-y-5 px-4 py-5 lg:px-6 lg:py-6 ${wide ? 'max-w-none' : 'max-w-6xl'}`}>
      <PageHeader title={title} line={line} below={below} stacked>{actions}</PageHeader>
      {children}
    </div>
  )
}
