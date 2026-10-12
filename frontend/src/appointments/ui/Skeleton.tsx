import { useTranslation } from 'react-i18next'

export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-lg bg-a-surface-2 ${className}`} />
}

/** A quiet stand-in for the grid while the calendar loads (spec 4.6). */
export function CalendarSkeleton() {
  const { t } = useTranslation()
  return (
    <div role="status" className="p-4">
      <span className="sr-only">{t('appointments.common.loading', 'Loading…')}</span>
      <div className="flex gap-3">
        {[0, 1, 2, 3].map(c => (
          <div key={c} className="flex-1 space-y-3">
            <Skeleton className="h-10" />
            <Skeleton className="h-24" />
            <Skeleton className="h-14" />
            <Skeleton className="h-32" />
          </div>
        ))}
      </div>
    </div>
  )
}
