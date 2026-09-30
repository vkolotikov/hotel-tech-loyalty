import { useTranslation } from 'react-i18next'
import type { HistoryEntry } from '../lib/types'
import { formatInstant } from '../lib/wallClock'

/** `service_booking.bulk.mark_no_show` → `bulk_mark_no_show`: the key under appointments.history. */
function suffix(action: string): string {
  return action.replace(/^service_booking\./, '').replace(/\./g, '_')
}

/** Who changed the appointment and when. Audit times are real instants, shown in the venue's zone. */
export function History({ entries, zone, locale }: { entries: HistoryEntry[]; zone: string; locale: string }) {
  const { t } = useTranslation()
  if (entries.length === 0) return null

  return (
    <section>
      <h3 className="text-sm font-semibold text-a-text mb-1">{t('appointments.history.title', 'History')}</h3>
      <ol className="space-y-1 text-sm">
        {entries.map((e, i) => (
          <li key={i} className="flex flex-wrap gap-x-2 text-a-text-2">
            <time dateTime={e.at}>{formatInstant(e.at, locale, zone)}</time>
            <span className="text-a-text">{t(`appointments.history.${suffix(e.action)}`, e.description ?? e.action)}</span>
            <span>{e.actor ?? t('appointments.history.system', 'System')}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
