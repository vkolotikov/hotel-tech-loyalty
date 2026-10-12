import type { ReactNode } from 'react'

type Tone = 'info' | 'success' | 'warning' | 'danger'

const TONE: Record<Tone, string> = {
  info:    'bg-a-surface-2 text-a-text border-a-border',
  success: 'bg-a-st-confirmed/[0.12] text-a-st-confirmed border-a-st-confirmed/20',
  warning: 'bg-a-st-pending/[0.12] text-a-st-pending border-a-st-pending/20',
  danger:  'bg-a-danger/[0.12] text-a-danger border-a-danger/20',
}

export function Notice({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={`rounded-xl border px-3.5 py-2.5 text-sm animate-a-fade ${TONE[tone]}`}>
      {children}
    </div>
  )
}
