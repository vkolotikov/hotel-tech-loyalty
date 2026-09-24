import type { ReactNode } from 'react'

const TONE = {
  neutral: 'bg-p-surface-2 text-p-text-2',
  accent:  'bg-p-accent/10 text-p-accent-deep',
  success: 'bg-p-success/10 text-p-success',
  warning: 'bg-p-warning/10 text-p-warning',
  danger:  'bg-p-danger/10 text-p-danger',
} as const

export function Chip({ tone = 'neutral', children }: { tone?: keyof typeof TONE; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONE[tone]}`}>{children}</span>
}
