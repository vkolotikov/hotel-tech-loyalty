import type { ReactNode, Ref } from 'react'
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react'

const TONE = {
  info:    'border-p-border bg-p-surface-2 text-p-text',
  success: 'border-p-success/30 bg-p-success/10 text-p-success',
  warning: 'border-p-warning/30 bg-p-warning/10 text-p-warning',
  danger:  'border-p-danger/30 bg-p-danger/10 text-p-danger',
} as const

/** `ref` and `tabIndex` let a caller move focus to the notice from script (`tabIndex={-1}`: focusable, but not a
 *  tab stop) — the Book flow does after a bounce, so the sentence is read first. */
export function Notice({ tone = 'info', children, tabIndex, ref }: { tone?: keyof typeof TONE; children: ReactNode; tabIndex?: number; ref?: Ref<HTMLDivElement> }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div ref={ref} tabIndex={tabIndex} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={`flex gap-2 rounded-p-control border p-3 text-sm ${TONE[tone]}`}>
      <Icon size={16} className="shrink-0 mt-px" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  )
}
