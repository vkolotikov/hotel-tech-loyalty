import type { ReactNode, Ref } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'

const TONE = {
  info:    'border-p-border bg-p-surface-2 text-p-text',
  success: 'border-p-success/30 bg-p-success/10 text-p-success',
  warning: 'border-p-warning/30 bg-p-warning/10 text-p-warning',
  danger:  'border-p-danger/30 bg-p-danger/10 text-p-danger',
} as const

/** `ref` and `tabIndex` let a caller move focus to the notice from script (`tabIndex={-1}`: focusable, but not a
 *  tab stop) — the Book flow does after a bounce, so the sentence is read first. `onDismiss`, when given, adds a
 *  small close button — a notice that must stay on screen until the member dismisses it
 *  (rather than clearing itself the moment something unrelated re-renders the page) needs its own explicit way
 *  to go away; `Bookings.tsx`'s away-cancellation notice is the first caller. */
export function Notice({ tone = 'info', children, tabIndex, ref, onDismiss }: { tone?: keyof typeof TONE; children: ReactNode; tabIndex?: number; ref?: Ref<HTMLDivElement>; onDismiss?: () => void }) {
  const { t } = useTranslation()
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle
  return (
    <div ref={ref} tabIndex={tabIndex} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'} className={`flex gap-2 rounded-p-control border p-3 text-sm ${TONE[tone]}`}>
      <Icon size={16} className="shrink-0 mt-px" aria-hidden />
      <div className="min-w-0 flex-1">{children}</div>
      {onDismiss && (
        <button type="button" onClick={onDismiss} aria-label={t('portal.common.close', 'Close')} className="shrink-0 -m-1 p-1 rounded text-current opacity-70 hover:opacity-100">
          <X size={14} />
        </button>
      )}
    </div>
  )
}
