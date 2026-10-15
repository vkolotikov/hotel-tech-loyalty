import { useCallback, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi } from '../lib/api'
import { initialsOf } from '../../workspace/lib/firstLetter'
import type { AppointmentSummary, CalendarMaster, DateKey } from '../lib/types'
import { timeOf } from '../../workspace/lib/wallClock'
import { Figure } from '../../workspace/ui/Typography'
import { avatarsThatFit, takenNet, todayFigures } from './todayFigures'

/** The content width of the element the returned ref is put on, kept up to date; 0 until it is measured (and on the server). */
function useContentWidth(): [(el: HTMLElement | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

/**
 * One tile. The heading carries the eyebrow look itself: Eyebrow is a div, and a tile's title should be a heading.
 * `delay` is passed whole (`[animation-delay:60ms]`) so Tailwind sees the literal. Each tile is a container of its
 * own, so its figure can be sized to it (Figure `fit`).
 */
function Tile({ title, delay = '', children }: { title: string; delay?: string; children: ReactNode }) {
  return (
    <div className={`rounded-xl border border-a-border bg-a-surface p-4 shadow-a-sm animate-a-rise min-w-0 [container-type:inline-size] ${delay}`}>
      <h2 className="font-a-mono text-xs font-medium uppercase tracking-[0.12em] text-a-text-2 mb-1">{title}</h2>
      {children}
    </div>
  )
}

/** The line under a figure. With no text it still holds its line, so a tile does not change height when its words arrive. */
function Sub({ children }: { children?: string }) {
  if (children === undefined) return <p aria-hidden className="mt-1 text-sm">&nbsp;</p>
  return <p className="mt-1 line-clamp-2 text-sm text-a-text-2" title={children}>{children}</p>
}

const DASH = '—'

/**
 * The day at a glance (spec §5.4): appointments, next up, the day's takings (managers) or what needs attention, and who is in.
 *
 * `pending`: the calendar is showing the previous day's payload while this day loads. The strip stays mounted (nothing
 * jumps, nothing replays) but claims nothing: every figure is a dash and the lines that would state a count or a name are
 * empty. "Off: the whole team" for a day whose hours have not arrived would be false.
 */
export function TodayStrip({ date, now, appointments, masters, pending = false }: {
  date: DateKey
  now: { date: DateKey; minutes: number }
  appointments: AppointmentSummary[]
  masters: CalendarMaster[]
  pending?: boolean
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const canManage = boot.staff.can_manage === true
  const f = todayFigures(appointments, masters, date, now)

  // Money stays manager-only: the request is not even made for anyone else (a disabled query neither polls nor refetches).
  // It refreshes the way the calendar does (CalendarPage), so a payment taken at another desk, on a phone or online
  // shows up while the cards update.
  const takings = useQuery({
    queryKey: ['appointments', 'takings', date],
    queryFn: () => appointmentsApi.takings(date),
    enabled: canManage,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  })
  const taken = takings.data ? takenNet(takings.data, boot.venue.currency) : null

  const nextLine = f.next
    ? t('appointments.today.next_line', '{{service}} · {{client}} with {{member}}', { service: f.next.service?.name ?? '—', client: f.next.client.name, member: f.next.master?.name ?? '—' })
    // "Nothing else" only once the day has had something.
    : f.nextIsFirst || f.total === 0 ? t('appointments.today.nothing', 'Nothing booked') : t('appointments.today.nothing_more', 'Nothing else booked today')

  // The Team tile draws the avatars its row has room for (a big team, or a narrow tile, would spill out) and counts the rest.
  const [measureRow, rowWidth] = useContentWidth()
  const fit = avatarsThatFit(pending ? 0 : f.teamIn.length, rowWidth)
  const shown = f.teamIn.slice(0, fit.shown)
  const more = fit.more
  const avatar = 'grid h-9 w-9 shrink-0 place-items-center rounded-full bg-a-surface-2 text-xs font-semibold text-a-text'
  const teamLine = t('appointments.today.team_in', 'In: {{count}}', { count: f.teamIn.length })
    + (f.teamOff.length > 0 ? ` · ${t('appointments.today.team_off', 'Off: {{names}}', { names: f.teamOff.map(m => m.name).join(', ') })}` : '')

  // Four tiles in a row where the strip itself has room for them, else two by two (workspace.css, [data-glance]):
  // the screen's width says nothing of the open panel or the side menu.
  return (
    <div className="[container-type:inline-size]">
      <section data-glance="" aria-label={t('appointments.today.label', 'At a glance')} aria-busy={pending || undefined} className="grid grid-cols-2 gap-3 pb-3">
        <Tile title={t('appointments.overview.total', 'Appointments')}>
          <Figure fit>{pending ? DASH : f.total}</Figure>
          <Sub>{pending ? undefined : t('appointments.today.done_noshow', '{{done}} done · {{noshow}} no-show', { done: f.done, noshow: f.noShow })}</Sub>
        </Tile>

        <Tile title={f.nextIsFirst ? t('appointments.today.first', 'First appointment') : t('appointments.today.next', 'Next up')} delay="[animation-delay:60ms]">
          <Figure fit>{!pending && f.next ? timeOf(f.next.start) : DASH}</Figure>
          <Sub>{pending ? undefined : nextLine}</Sub>
        </Tile>

        {canManage ? (
          <Tile title={t('appointments.today.takings', 'Takings')} delay="[animation-delay:120ms]">
            <Figure fit>{!pending && taken ? money(taken.amount, boot.venue.currency) : DASH}</Figure>
            <Sub>{!pending && taken ? t('appointments.today.payments', 'Payments: {{count}}', { count: taken.payments }) : undefined}</Sub>
          </Tile>
        ) : (
          <Tile title={t('appointments.overview.attention', 'Needs attention')} delay="[animation-delay:120ms]">
            <Figure fit>{pending ? DASH : f.attention}</Figure>
            <Sub>{t('appointments.today.attention_hint', 'Awaiting confirmation or late')}</Sub>
          </Tile>
        )}

        <Tile title={t('appointments.today.team', 'Team')} delay="[animation-delay:180ms]">
          <div ref={measureRow} className="flex h-[2.375rem] items-center">
            {shown.map((m, i) => (
              <span key={m.id} aria-hidden title={m.name} style={{ '--a-m': m.color } as CSSProperties}
                className={`a-member-ring ${avatar} ${i > 0 ? '-ml-1.5' : ''}`}>{initialsOf(m.name)}</span>
            ))}
            {more > 0 && <span aria-hidden className={`${avatar} ${shown.length > 0 ? '-ml-1.5' : ''} border border-a-border`}>+{more}</span>}
            {pending && <span aria-hidden className="font-a-display text-3xl font-light leading-tight text-a-text">{DASH}</span>}
          </div>
          <Sub>{pending ? undefined : teamLine}</Sub>
        </Tile>
      </section>
    </div>
  )
}
