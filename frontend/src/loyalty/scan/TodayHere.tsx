import { useTranslation } from 'react-i18next'
import { Check, ClipboardList, Ticket, UserPlus, X, type LucideIcon } from 'lucide-react'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { points } from '../lib/format'
import type { Today } from './useToday'
import { useSay } from './useSay'

/** Today's numbers as small pills, each with its icon: "Let in: 23", "Refused: 2" / "Checked in: 12", "Signed up: 30", "Places left: 8". */
export function TodayCounts({ today, locale }: { today: Today; locale: string }) {
  const { t } = useTranslation()
  const c = today.counts
  if (!c) return null
  const n = (v: number) => points(v, locale)
  const parts: [LucideIcon, string, string][] = c.kind === 'place'
    ? [
        [Check, 'l-plus', t('loyalty.door.today_let_in', 'Let in: {{number}}', { number: n(c.granted) })],
        [X, 'l-minus', t('loyalty.door.today_refused', 'Refused: {{number}}', { number: n(c.denied) })],
      ]
    : [
        [Check, 'l-plus', t('loyalty.door.today_checked_in', 'Checked in: {{number}}', { number: n(c.checkedIn) })],
        // Without sign-up there is nobody signed up and everyone is a walk-in: "Checked in" says it all.
        ...(c.signUp !== false ? [[ClipboardList, '', t('loyalty.door.today_signed_up', 'Signed up: {{number}}', { number: n(c.signedUp) })] as [LucideIcon, string, string]] : []),
        ...(c.signUp !== false && c.walkIns > 0 ? [[UserPlus, '', t('loyalty.door.today_walk_ins', 'Walk-ins: {{number}}', { number: n(c.walkIns) })] as [LucideIcon, string, string]] : []),
        ...(c.roomLeft !== null ? [[Ticket, '', t('loyalty.door.today_room_left', 'Places left: {{number}}', { number: n(c.roomLeft) })] as [LucideIcon, string, string]] : []),
      ]
  return (
    <ul data-today-counts="" className="flex flex-wrap gap-1.5">
      {parts.map(([Icon, tone, words]) => (
        <li key={words} className="inline-flex items-center gap-1.5 rounded-full bg-a-surface-2 px-2.5 py-1 text-xs font-medium text-a-text">
          <Icon size={13} strokeWidth={2.5} aria-hidden className={tone || 'text-a-text-2'} />{words}
        </li>
      ))}
    </ul>
  )
}

/** "Today here" under the scanner: today's numbers and the latest who came in (or were turned away), newest first. */
export function TodayHere({ today, locale }: { today: Today; locale: string }) {
  const { t } = useTranslation()
  const say = useSay()
  return (
    <section aria-labelledby="scan-today" data-today="" className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 id="scan-today" className="font-a-display text-xl text-a-text">{t('loyalty.door.today_title', 'Today here')}</h2>
        <TodayCounts today={today} locale={locale} />
      </div>
      {today.isLoading && <div className="space-y-2"><Skeleton className="h-9" /><Skeleton className="h-9" /></div>}
      {today.isError && <p className="text-sm text-a-text-2">{t('loyalty.door.today_failed', 'Today’s list could not be loaded. It tries again in a minute.')}</p>}
      {!today.isLoading && !today.isError && today.lines.length === 0 && (
        <p className="text-sm text-a-text-2">{t('loyalty.door.today_none', 'Nobody scanned in yet today.')}</p>
      )}
      {today.lines.length > 0 && (
        <ul className="-mx-5 divide-y divide-a-border">
          {today.lines.map(line => (
            <li key={line.id} className="flex items-center gap-3 px-5 py-2.5">
              <span className="w-12 shrink-0 font-a-mono text-sm tabular-nums text-a-text-2">{line.time}</span>
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full bg-a-surface-2 ${line.granted ? 'l-plus' : 'l-minus'}`}>
                {line.granted ? <Check size={14} strokeWidth={3} aria-hidden /> : <X size={14} strokeWidth={3} aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-a-text">{line.name || t('loyalty.door.today_no_member', 'No member')}</span>
                {line.number && line.name !== line.number && <span className="block truncate font-a-mono text-xs text-a-text-2">{line.number}</span>}
              </span>
              <span className={`shrink-0 text-right text-xs font-semibold ${line.granted ? 'l-plus' : 'l-minus'}`}>{say(line.label)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
