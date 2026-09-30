import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  info:    'bg-a-surface-2 text-a-text',
  success: 'bg-a-st-confirmed/[0.12] text-a-st-confirmed',
  warning: 'bg-a-st-pending/[0.12] text-a-st-pending',
  danger:  'bg-a-danger/[0.12] text-a-danger',
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-lg px-3 py-2 text-sm ${TONE[tone]}`}>
      {children}
    </div>
  )
}
