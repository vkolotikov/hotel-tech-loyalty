import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { money as fmt } from '../../lib/money'
import { useBoot } from '../AppointmentsProvider'
import { appointmentsApi, failureOf } from '../lib/api'
import type { DateKey, Insights, InsightsFigures, InsightsRow } from '../lib/types'
import { formatDate } from '../lib/wallClock'
import { Button } from '../ui/Button'
import { Field } from '../ui/Field'
import { Notice } from '../ui/Notice'
import {
  ARROW, PICKS, TONE_CLASS, average, canShow, countChange, formatPeriod, formatShare, moneyChange, needsDeskNote, onlineShare,
  pickOf, pointsChange, rangeFor, rangeFromSearch, share, toneOf, type Change, type Metric, type Range,
} from './insightsMath'

const PICK_FALLBACK = { this_week: 'This week', last_week: 'Last week', this_month: 'This month', last_month: 'Last month', custom: 'Choose dates' }
const TILE_FALLBACK = {
  done: 'Visits done', no_show: 'No-shows', late_cancel: 'Late cancellations', value_done: 'Value of visits done',
  average: 'Average per visit', taken: 'Money taken', owed_done: 'Still owed',
}

/** How the venue is doing over a period (Part G, managers only; the server refuses everyone else). */
export function InsightsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const range = rangeFromSearch(search, boot.venue.today)
  const q = useQuery({ queryKey: ['appointments', 'insights', range.from, range.to], queryFn: () => appointmentsApi.insights(range.from, range.to) })

  return (
    <div className="p-4 lg:p-6 space-y-4">
      <h1 className="text-xl font-semibold text-a-text">{t('appointments.insights.title', 'Insights')}</h1>
      <PeriodPicker range={range} today={boot.venue.today} onGo={(r) => setSearch({ from: r.from, to: r.to })} />
      {q.isLoading && <p className="text-sm text-a-text-2" role="status">{t('appointments.common.loading', 'Loading…')}</p>}
      {q.isError && <InsightsError error={q.error} />}
      {q.data && <InsightsView data={q.data} locale={i18n.language || 'en'} />}
    </div>
  )
}

/** The period picks and the chosen-dates form, starting from the period in the address. */
export function PeriodPicker({ range, today, onGo }: { range: Range; today: DateKey; onGo: (r: Range) => void }) {
  const { t } = useTranslation()
  const pick = pickOf(range, today)
  const rangeKey = `${range.from}|${range.to}`
  const [seen, setSeen] = useState(rangeKey)
  const [choosing, setChoosing] = useState(pick === 'custom')
  const [draft, setDraft] = useState<Range>(range)
  // The address changed (a pick, Show, Back, the menu): start again from it (polish G1). Reset here rather than by
  // remounting, so the button just pressed keeps the keyboard focus (polish review).
  if (seen !== rangeKey) {
    setSeen(rangeKey)
    setChoosing(pick === 'custom')
    setDraft(range)
  }
  const input = 'rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

  return (
    <>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('appointments.insights.title', 'Insights')}>
        {PICKS.map(p => (
          <Button key={p} type="button" size="sm" variant={pick === p && !choosing ? 'primary' : 'ghost'} aria-pressed={pick === p && !choosing}
            onClick={() => { setChoosing(false); onGo(rangeFor(p, today)) }}>
            {t(`appointments.insights.pick.${p}`, PICK_FALLBACK[p])}
          </Button>
        ))}
        <Button type="button" size="sm" variant={choosing ? 'primary' : 'ghost'} aria-pressed={choosing} onClick={() => setChoosing(true)}>
          {t('appointments.insights.pick.custom', PICK_FALLBACK.custom)}
        </Button>
      </div>
      {choosing && (
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (canShow(draft)) onGo(draft) }}>
          <Field label={t('appointments.insights.from', 'From')}>
            <input type="date" required className={input} value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value as DateKey })} />
          </Field>
          <Field label={t('appointments.insights.to', 'To')}>
            <input type="date" required className={input} value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value as DateKey })} />
          </Field>
          {/* Both dates first: an empty one used to fall back to This week without a word (polish G2). */}
          <Button type="submit" size="sm" disabled={!canShow(draft)}>{t('appointments.insights.show', 'Show')}</Button>
        </form>
      )}
    </>
  )
}

/** A refusal in the server's own words (a period over a year, From after To); anything else, the workspace's sentence. */
export function InsightsError({ error }: { error: unknown }) {
  const { t } = useTranslation()
  const f = failureOf(error)
  // The workspace's not_allowed words speak of an appointment; here the refusal is the page itself.
  // An answer without a code of ours (a 500, a gateway page) gets the workspace's sentence, never raw text or nothing.
  const text = f.code === 'not_allowed'
    ? t('appointments.insights.managers_only', 'Insights are for owners and managers.')
    : f.code && f.code !== 'unknown' ? t(`appointments.error.${f.code}`, f.message) : t('appointments.common.error', 'Something went wrong. Please try again.')
  return <Notice tone="danger">{text}</Notice>
}

export function InsightsView({ data, locale }: { data: Insights; locale: string }) {
  const { t } = useTranslation()
  const now = data.current
  const before = data.before
  const total = Object.values(now.groups).reduce((a, b) => a + b, 0)
  const currencies = Object.keys(now.money).sort()

  const changeText = (c: Change | null, kind: 'count' | 'points' | 'money', before?: number, cur?: string) => {
    if (c === null) return '—'
    if (c.direction === 'same') return t('appointments.insights.no_change', 'No change')
    const delta = kind === 'money' ? fmt(c.delta, cur) : kind === 'points' ? c.delta.toLocaleString(locale) : String(c.delta)
    const key = kind === 'count' ? 'change_count' : kind === 'points' ? 'change_points' : 'change_money'
    const fallback = kind === 'count' ? '{{arrow}} {{delta}} vs {{before}}' : kind === 'points' ? '{{arrow}} {{delta}} pts' : '{{arrow}} {{delta}}'
    return t(`appointments.insights.${key}`, fallback, { arrow: ARROW[c.direction], delta, before })
  }
  const changeLine = (metric: Metric, c: Change | null, kind: 'count' | 'points' | 'money', prev?: number, cur?: string) => (
    <p className={`text-xs ${c ? TONE_CLASS[toneOf(metric, c.direction)] : TONE_CLASS.plain}`}>{changeText(c, kind, prev, cur)}</p>
  )

  const rate = (f: InsightsFigures, key: 'done' | 'no_show' | 'late_cancel') => share(f.groups[key], f.due)
  const countTile = (key: 'done' | 'no_show' | 'late_cancel') => (
    <Tile key={key} title={t(`appointments.insights.tile.${key}`, TILE_FALLBACK[key])}>
      <p className="text-2xl font-semibold text-a-text">{now.groups[key]} <span className="text-sm font-normal text-a-text-2">({formatShare(rate(now, key), locale)})</span></p>
      {key === 'done'
        ? changeLine('done', countChange(now.groups.done, before.groups.done), 'count', before.groups.done)
        : changeLine(key, pointsChange(rate(now, key), rate(before, key)), 'points')}
    </Tile>
  )
  const moneyTile = (key: 'value_done' | 'average' | 'taken' | 'owed_done') => (
    <Tile key={key} title={t(`appointments.insights.tile.${key}`, TILE_FALLBACK[key])}>
      {currencies.length === 0 && <p className="text-2xl font-semibold text-a-text">—</p>}
      {currencies.map(cur => {
        const m = now.money[cur]
        const p = before.money[cur]
        const value = key === 'average' ? average(m) : m[key]
        const prev = p === undefined ? undefined : key === 'average' ? average(p) ?? undefined : p[key]
        return (
          <div key={cur}>
            <p className="text-2xl font-semibold text-a-text">{value === null ? '—' : fmt(value, cur)}</p>
            {key !== 'owed_done' && changeLine(key, value === null ? null : moneyChange(value, prev), 'money', undefined, cur)}
          </div>
        )
      })}
    </Tile>
  )

  return (
    <div className="space-y-4">
      <div className="space-y-1 text-sm text-a-text-2">
        <p>{t('appointments.insights.period_line', '{{period}} · compared with {{previous}} · late = cancelled inside {{hours}} h', {
          period: formatPeriod(data.period, locale), previous: formatPeriod(data.previous, locale), hours: data.cancel_hours,
        })}</p>
        <p>{t('appointments.insights.money_note', 'Money taken counts the money for these visits whenever it was paid; Takings shows money by the day it moved.')}</p>
        {/* The period compared with always starts first: before the ledger, its money (and so every change) is understated. */}
        {needsDeskNote(data.previous.from, data.desk_ledger_since) && (
          <Notice tone="warning">{t('appointments.insights.desk_note', 'Desk payments before {{date}} were not recorded here: money taken may be lower, and still owed higher, than it really was.', {
            date: formatDate(data.desk_ledger_since, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
          })}</Notice>
        )}
      </div>

      {total === 0
        ? <p className="text-sm text-a-text-2">{t('appointments.insights.empty', 'No appointments in this period.')}</p>
        : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
              {countTile('done')}
              {countTile('no_show')}
              {countTile('late_cancel')}
              {moneyTile('value_done')}
              {moneyTile('average')}
              {moneyTile('taken')}
              {moneyTile('owed_done')}
            </div>
            <p className="text-sm text-a-text-2">{t('appointments.insights.out_of', 'Out of {{due}} bookings due · {{unmarked}} not marked yet (mark them Completed or No-show) · {{early}} cancelled in time · {{ahead}} booked ahead', {
              due: now.due, unmarked: now.groups.unmarked, early: now.groups.early_cancel, ahead: now.groups.ahead,
            })}</p>
            <Breakdown title={t('appointments.insights.by_service', 'By service')} heading={t('appointments.insights.col.service', 'Service')} rows={now.by_service} locale={locale} />
            <Breakdown title={t('appointments.insights.by_person', 'By person')} heading={t('appointments.insights.col.person', 'Person')} rows={now.by_person} locale={locale} />
            <section className="space-y-1">
              <h2 className="text-base font-semibold text-a-text">{t('appointments.insights.sources_title', 'Where bookings come from')}</h2>
              <p className="text-sm text-a-text">{t('appointments.insights.sources', 'Online {{online}} · At the desk {{desk}} · Other {{other}} — booked online: {{share}}', {
                ...now.sources, share: formatShare(onlineShare(now.sources), locale),
              })}</p>
            </section>
          </>
        )}
    </div>
  )
}

function Tile({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-a-border bg-a-surface p-3 space-y-1">
      <h2 className="text-xs font-medium text-a-text-2">{title}</h2>
      {children}
    </section>
  )
}

function Breakdown({ title, heading, rows, locale }: { title: string; heading: string; rows: InsightsRow[]; locale: string }) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  const name = (r: InsightsRow) => r.id === null
    ? t('appointments.insights.no_one', 'No one assigned')
    : r.name ?? t('appointments.insights.removed', '(removed)')
  const cell = (count: number, due: number) => `${count} (${formatShare(share(count, due), locale)})`

  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-a-text">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="text-left text-a-text-2">
              <th className="py-1 font-medium">{heading}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.due', 'Due')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.done', 'Done')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.no_show', 'No-shows')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.late_cancel', 'Late cancellations')}</th>
              <th className="text-right font-medium">{t('appointments.insights.col.value_done', 'Value')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id ?? 'none'} className="border-t border-a-border">
                <td className="py-1 text-a-text">{name(r)}</td>
                <td className="text-right">{r.due}</td>
                <td className="text-right">{r.done}</td>
                <td className="text-right">{cell(r.no_show, r.due)}</td>
                <td className="text-right">{cell(r.late_cancel, r.due)}</td>
                <td className="text-right">{Object.entries(r.value_done).map(([cur, v]) => fmt(v, cur)).join(' · ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
