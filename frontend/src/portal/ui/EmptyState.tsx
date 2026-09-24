import type { ReactNode } from 'react'
import { Card } from './Card'

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <Card className="p-8 text-center">
      {icon && <div className="mx-auto mb-3 w-11 h-11 rounded-full bg-p-accent/10 text-p-accent-deep flex items-center justify-center">{icon}</div>}
      <p className="text-sm font-semibold text-p-text">{title}</p>
      {body && <p className="text-sm text-p-text-2 mt-1">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </Card>
  )
}
