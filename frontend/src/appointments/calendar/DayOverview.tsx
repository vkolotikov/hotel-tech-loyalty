import { useTranslation } from 'react-i18next'
import { STATUSES } from '../lib/status'
import { StatusMark } from '../ui/StatusMark'

/**
 * The side column's key to the statuses. The day's counts live in the Today
 * strip above the calendar (one place for the numbers, from the same
 * appointments); this stays for what each icon and word means.
 */
export function DayOverview() {
  const { t } = useTranslation()
  return (
    <section className="p-4 border-t border-a-border">
      {/* The eyebrow look, on the heading itself: Eyebrow is a div, and a div may not sit inside an h2. */}
      <h2 className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2 mb-2">{t('appointments.overview.legend', 'Statuses')}</h2>
      <ul className="space-y-1.5">
        {STATUSES.map(s => <li key={s}><StatusMark status={s} /></li>)}
      </ul>
    </section>
  )
}
