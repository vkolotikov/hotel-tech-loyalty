import { useEffect, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Figure } from '../../workspace/ui/Typography'
import type { ThemeName } from '../../workspace/theme/accent'
import { useBoot } from '../LoyaltyProvider'
import { formatDate } from '../../workspace/lib/wallClock'
import { points } from '../lib/format'
import { named } from '../lib/forms'
import { useLook } from '../lib/look'
import type { TierRef } from '../lib/types'
import { TierChip } from '../ui/TierChip'
import '../theme/insights.css'
import { insightsApi, insightsKey } from './api'
import { AtRiskList } from './AtRiskList'
import { CohortsCard } from './CohortsCard'
import { MoneyCard } from './MoneyCard'
import { BarList, type BarRow } from './charts/BarList'
import { ColumnChart } from './charts/ColumnChart'
import { LineChart } from './charts/LineChart'
import { Legend } from './charts/parts'
import {
  PERIODS, bandShape, bucketLong, bucketShort, insightsAccess, isEmptyProgramme, percentText, periodFrom, periodText,
  quietFrom, searchWith, shareOf, tierOf,
} from './insightsMath'
import { Card, Empty, LoadFailed, Loading } from './parts'
import type { Band, EngagementGroup, Insights, Period } from './types'
import {
  BUCKET_HEAD_WORDS, BUCKET_WORDS, DIRECTION_WORDS, ENGAGEMENT_HINT_WORDS, ENGAGEMENT_WORDS, GROWTH_LINE_WORDS, PERIOD_WORDS,
  REDEMPTION_WORDS,
} from './words'

const ENGAGEMENT_ORDER: readonly EngagementGroup[] = ['new', 'active', 'at_risk', 'dormant']

/**
 * Insights (spec 2026-10-21 release 2 §5): how the programme is doing over 30 days, 90 days or 12 months — the
 * figures, members over time, points in and out, reward redemptions, the tiers and their movement, points due to
 * expire, engagement and balances, since release 4 the money members bring and cohort retention — and the members
 * gone quiet. The period and the quiet days live in the address
 * (`?period=`, `?quiet=`). For managers and staff who may see analytics; anyone else who opens it by its address sees
 * a calm notice, and the server refuses them anyway. Every figure is the server's, counted on the venue's clock.
 */
export function DetailedInsights() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const location = useLocation()
  const navigate = useNavigate()
  const period = periodFrom(location.search)
  const quiet = quietFrom(location.search)
  const { view } = insightsAccess(boot.staff.can)
  const go = (change: { period?: Period; quiet?: number }) =>
    navigate({ pathname: '/loyalty/insights', search: searchWith(location.search, change) + (location.search.includes('view=detailed') ? '' : '&view=detailed') }, { replace: true })
  const query = useQuery({ queryKey: insightsKey(period), queryFn: () => insightsApi.insights(period), enabled: view, placeholderData: keepPreviousData })
  const data = query.data
  useEffect(() => { if (data && location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView({ block: 'start' }) }, [data, location.hash])

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.insights.title', 'Insights')}
        line={t('loyalty.insights.line', 'How the programme is doing, for the whole organisation, on the venue’s clock.')}
        below={view && data && (
          <p data-period-line="" className="text-sm text-a-text-2">
            {t('loyalty.insights.period_line', '{{dates}}, {{bucket}}', {
              dates: periodText(data.from, data.to, locale), bucket: word(t, 'bucket', BUCKET_WORDS, data.bucket),
            })}
          </p>
        )}>
        {view && (
          <div role="group" aria-label={t('loyalty.insights.period_choice', 'Period')} className="flex flex-wrap gap-2">
            {PERIODS.map(p => (
              <button key={p} type="button" aria-pressed={p === period} onClick={() => go({ period: p })}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-medium ${p === period ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
                {word(t, 'period', PERIOD_WORDS, p)}
              </button>
            ))}
          </div>
        )}
      </PageHeader>

      {!view && (
        <div className="max-w-xl" data-no-right="">
          <Notice>{t('loyalty.insights.no_right', 'Insights are for owners, managers and staff who may see analytics. A manager can change that under Team in the full admin.')}</Notice>
        </div>
      )}
      {view && query.isError && !data && <LoadFailed family="load" error={query.error} onRetry={() => { void query.refetch() }} />}
      {view && !data && query.isLoading && <Loading rows={4} />}
      {view && data && isEmptyProgramme(data) && (
        <Empty>{t('loyalty.insights.empty', 'Nothing to show yet. Once members join and earn points, this page shows how many there are, the points they earn and spend, their tiers, and who has gone quiet.')}</Empty>
      )}
      {view && data && !isEmptyProgramme(data) && (
        <div className={`space-y-6 ${query.isFetching ? 'opacity-80' : ''}`}>
          <InsightsView data={data} tiers={boot.programme.tiers} theme={look.resolved} locale={locale} />
          <MoneyCard period={period} locale={locale} />
          <CohortsCard locale={locale} />
          <AtRiskList quiet={quiet} onQuiet={(days) => go({ quiet: days })} tiers={boot.programme.tiers} theme={look.resolved} locale={locale} timeZone={boot.venue.timezone} />
        </div>
      )}
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']

/** A server value in its family's words, or the value itself when the family has no word for it. */
function word(t: T, family: string, words: Record<string, string>, value: string): string {
  const key = named(`loyalty.insights.${family}`, words, value)
  return key ? t(...key) : value
}

/** The tiles, the charts and the lists of one period. */
export function InsightsView({ data, tiers, theme, locale }: { data: Insights; tiers: readonly TierRef[]; theme: ThemeName; locale: string }) {
  const { t } = useTranslation()
  const n = (value: number) => points(value, locale)
  const keys = data.points.map(b => b.key)
  const short = keys.map(k => bucketShort(k, data.bucket, locale))
  const long = keys.map(k => bucketLong(k, data.bucket, locale))
  const heading = word(t, 'bucket_head', BUCKET_HEAD_WORDS, data.bucket)
  const axis = { keys, kind: data.bucket, short, long, heading, locale, format: n }
  const tiles = data.tiles

  const issued = t('loyalty.insights.points.issued', 'Issued')
  const redeemed = t('loyalty.insights.points.redeemed', 'Redeemed')
  const expired = t('loyalty.insights.points.expired', 'Expired')
  const redemptionSeries = (['fulfilled', 'pending', 'cancelled'] as const).map((state, i) => ({
    name: word(t, 'redemption', REDEMPTION_WORDS, state), tone: (i + 1) as 1 | 2 | 3, values: data.redemptions.map(b => b[state]),
  }))
  const redemptionCount = data.redemptions.reduce((sum, b) => sum + b.fulfilled + b.pending + b.cancelled, 0)

  return (
    <>
      <Tiles items={[
        ['members', t('loyalty.insights.tiles.members', 'Members'), n(tiles.members), null],
        ['new_members', t('loyalty.insights.tiles.new_members', 'New in this period'), n(tiles.new_members), null],
        ['active_members', t('loyalty.insights.tiles.active_members', 'Active, last 90 days'), n(tiles.active_members), null],
        ['outstanding', t('loyalty.insights.tiles.outstanding', 'Points outstanding'), n(tiles.outstanding), t('loyalty.insights.tiles.outstanding_line', 'Held by active members now')],
        ['issued', t('loyalty.insights.tiles.issued', 'Points issued'), n(tiles.issued), null],
        ['redeemed', t('loyalty.insights.tiles.redeemed', 'Points redeemed'), n(tiles.redeemed), null],
        ['expired', t('loyalty.insights.tiles.expired', 'Points expired'), n(tiles.expired), null],
        ['redemption_rate', t('loyalty.insights.tiles.redemption_rate', 'Redemption rate'), percentText(tiles.redemption_rate, locale), t('loyalty.insights.tiles.redemption_rate_line', 'Points redeemed for each 100 issued')],
      ]} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Card id="insights-growth" title={t('loyalty.insights.growth.title', 'Members over time')}
          line={word(t, 'growth_line', GROWTH_LINE_WORDS, data.bucket)}>
          <LineChart {...axis} caption={t('loyalty.insights.growth.total', 'Members')} name={t('loyalty.insights.growth.total', 'Members')} values={data.growth.map(b => b.total)} />
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.insights.growth.new', 'Joined')}</p>
          <ColumnChart {...axis} height={110} caption={t('loyalty.insights.growth.new', 'Joined')}
            up={[{ name: t('loyalty.insights.growth.new', 'Joined'), tone: 1, values: data.growth.map(b => b.new) }]} />
        </Card>

        <Card id="insights-points" title={t('loyalty.insights.points.title', 'Points in and out')}
          line={t('loyalty.insights.points.line', 'Issued above the line; redeemed and expired below it. A reversed line counts nowhere.')}>
          <Legend series={[{ name: issued, tone: 1 }, { name: redeemed, tone: 2 }, { name: expired, tone: 3 }]} />
          <ColumnChart {...axis} caption={t('loyalty.insights.points.title', 'Points in and out')}
            up={[{ name: issued, tone: 1, values: data.points.map(b => b.issued) }]}
            down={[{ name: redeemed, tone: 2, values: data.points.map(b => b.redeemed) }, { name: expired, tone: 3, values: data.points.map(b => b.expired) }]} />
        </Card>

        <Card id="insights-redemptions" title={t('loyalty.insights.redemptions.title', 'Reward redemptions')}
          line={t('loyalty.insights.redemptions.line', '{{total}} in this period, by the day each was made and where it stands now.', { total: n(redemptionCount) })}>
          <Legend series={redemptionSeries} />
          <ColumnChart {...axis} caption={t('loyalty.insights.redemptions.title', 'Reward redemptions')} up={redemptionSeries} />
        </Card>

        <Card id="insights-tiers" title={t('loyalty.insights.tiers.title', 'Members by tier')} line={t('loyalty.insights.tiers.line', 'Active members on each tier now.')}>
          <TierBars data={data} theme={theme} locale={locale} />
        </Card>

        <Card id="insights-movement" title={t('loyalty.insights.movement.title', 'Tier movement')} line={t('loyalty.insights.movement.line', 'Tier changes in this period.')}>
          <Movement data={data} tiers={tiers} locale={locale} />
        </Card>

        <Card id="insights-expiry" title={t('loyalty.insights.expiry.title', 'Points due to expire')}
          line={t('loyalty.insights.expiry.line', 'Points still held, by the month they expire: this month and the five after.')}>
          <Expiry data={data} locale={locale} />
        </Card>

        <Card id="insights-engagement" title={t('loyalty.insights.engagement.title', 'Engagement')} line={t('loyalty.insights.engagement.line', 'Active members now, in four groups.')}>
          <Engagement data={data} locale={locale} />
        </Card>

        <Card id="insights-balances" title={t('loyalty.insights.balances.title', 'Balances')} line={t('loyalty.insights.balances.line', 'Active members by the points they hold now.')}>
          <BarList label={t('loyalty.insights.balances.title', 'Balances')} rows={data.balances.map((band, i) => ({
            id: `band-${i}`, label: <BandLabel band={band} locale={locale} />, value: band.members, text: n(band.members),
          }))} />
        </Card>
      </div>
    </>
  )
}

/** The period's figures as a glance strip: two by two, four across where the strip has room (workspace.css). */
function Tiles({ items }: { items: [string, string, string, string | null][] }) {
  const { t } = useTranslation()
  return (
    <div className="[container-type:inline-size]">
      <dl data-glance="" aria-label={t('loyalty.insights.tiles.label', 'The figures')} className="grid grid-cols-2 gap-3">
        {items.map(([key, label, value, line]) => (
          <div key={key} data-tile={key} className="min-w-0 space-y-1 rounded-2xl border border-a-border bg-a-surface p-4 [container-type:inline-size]">
            <dt className="text-xs text-a-text-2">{label}</dt>
            <dd><Figure fit>{value}</Figure></dd>
            {line && <dd className="text-xs text-a-text-2">{line}</dd>}
          </div>
        ))}
      </dl>
    </div>
  )
}

function TierBars({ data, theme, locale }: { data: Insights; theme: ThemeName; locale: string }) {
  const { t } = useTranslation()
  const total = data.tiers.rows.reduce((sum, r) => sum + r.members, 0) + data.tiers.none
  const text = (count: number) => t('loyalty.insights.share', '{{value}} · {{share}}%', { value: points(count, locale), share: shareOf(count, total) })
  const rows: BarRow[] = data.tiers.rows.map(r => ({
    id: `tier-${r.id}`,
    label: <span className="inline-flex max-w-full items-center gap-1.5"><TierChip tier={r} theme={theme} size="sm" />{!r.is_active && <span className="truncate text-xs text-a-text-2">{t('loyalty.insights.tiers.off', 'switched off')}</span>}</span>,
    value: r.members,
    text: text(r.members),
  }))
  if (data.tiers.none > 0) rows.push({ id: 'tier-none', label: t('loyalty.common.no_tier', 'No tier'), value: data.tiers.none, text: text(data.tiers.none) })
  return rows.length === 0
    ? <Empty>{t('loyalty.insights.tiers.none', 'The programme has no tiers yet.')}</Empty>
    : <BarList label={t('loyalty.insights.tiers.title', 'Members by tier')} rows={rows} />
}

function Movement({ data, tiers, locale }: { data: Insights; tiers: readonly TierRef[]; locale: string }) {
  const { t } = useTranslation()
  const m = data.movement
  const figures: [string, ReactNode, number][] = [
    ['up', <ArrowUp key="up" size={14} aria-hidden />, m.up],
    ['down', <ArrowDown key="down" size={14} aria-hidden />, m.down],
    ['lateral', <ArrowRight key="lateral" size={14} aria-hidden />, m.lateral],
  ]
  const tone = { up: 1, down: 2, lateral: 3 } as const
  const name = (id: number) => tierOf(id, tiers)?.name ?? `#${id}`
  return (
    <>
      <dl className="grid grid-cols-3 gap-3">
        {figures.map(([key, icon, value]) => (
          <div key={key} data-move={key} className="min-w-0 rounded-xl bg-a-surface-2 px-3 py-2">
            <dt className="inline-flex items-center gap-1 text-xs text-a-text-2">{icon}{word(t, 'direction', DIRECTION_WORDS, key)}</dt>
            <dd className="text-lg font-semibold tabular-nums text-a-text">{points(value, locale)}</dd>
          </div>
        ))}
      </dl>
      {m.flows.length === 0
        ? <Empty>{t('loyalty.insights.movement.none', 'No member changed tier in this period.')}</Empty>
        : (
          <BarList label={t('loyalty.insights.movement.flows', 'From one tier to another')} rows={m.flows.map(f => ({
            id: `flow-${f.from}-${f.to}`,
            label: <>{t('loyalty.insights.movement.flow', '{{from}} → {{to}}', { from: name(f.from), to: name(f.to) })} <span className="text-xs text-a-text-2">· {word(t, 'direction', DIRECTION_WORDS, f.direction)}</span></>,
            value: f.count,
            text: points(f.count, locale),
            tone: tone[f.direction],
          }))} />
        )}
    </>
  )
}

function Expiry({ data, locale }: { data: Insights; locale: string }) {
  const { t } = useTranslation()
  const { overdue, months } = data.expiry
  return (
    <>
      {overdue.points > 0 && (
        <p data-overdue="" className="rounded-xl bg-a-surface-2 px-3 py-2 text-sm text-a-text">
          {t('loyalty.insights.expiry.overdue', '{{points}} points of {{members}} members have reached their date and go at the next expiry run.', {
            points: points(overdue.points, locale), members: points(overdue.members, locale),
          })}
        </p>
      )}
      <BarList label={t('loyalty.insights.expiry.title', 'Points due to expire')} rows={months.map(month => ({
        id: `month-${month.key}`,
        label: formatDate(`${month.key}-01`, locale, { month: 'long', year: 'numeric' }),
        value: month.points,
        text: points(month.points, locale),
      }))} />
    </>
  )
}

function Engagement({ data, locale }: { data: Insights; locale: string }) {
  const { t } = useTranslation()
  const total = ENGAGEMENT_ORDER.reduce((sum, g) => sum + data.engagement[g], 0)
  return (
    <>
      <BarList label={t('loyalty.insights.engagement.title', 'Engagement')} rows={ENGAGEMENT_ORDER.map(g => ({
        id: g,
        label: word(t, 'engagement', ENGAGEMENT_WORDS, g),
        value: data.engagement[g],
        text: t('loyalty.insights.share', '{{value}} · {{share}}%', { value: points(data.engagement[g], locale), share: shareOf(data.engagement[g], total) }),
      }))} />
      <dl className="grid gap-x-4 gap-y-1 text-xs text-a-text-2 sm:grid-cols-2">
        {ENGAGEMENT_ORDER.map(g => (
          <div key={g} className="flex gap-1">
            <dt className="font-medium text-a-text">{word(t, 'engagement', ENGAGEMENT_WORDS, g)}:</dt>
            <dd>{word(t, 'engagement_hint', ENGAGEMENT_HINT_WORDS, g)}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}

function BandLabel({ band, locale }: { band: Band; locale: string }) {
  const { t } = useTranslation()
  const shape = bandShape(band)
  switch (shape.kind) {
    case 'below': return <>{t('loyalty.insights.balances.below', 'Below zero')}</>
    case 'zero': return <>{t('loyalty.insights.balances.zero', 'None')}</>
    case 'over': return <>{t('loyalty.insights.balances.over', '{{min}} or more', { min: points(shape.min, locale) })}</>
    default: return <>{t('loyalty.insights.balances.range', '{{min}}–{{max}}', { min: points(shape.min, locale), max: points(shape.max, locale) })}</>
  }
}
