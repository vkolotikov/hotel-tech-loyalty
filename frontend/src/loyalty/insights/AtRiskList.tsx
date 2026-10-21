import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { ThemeName } from '../../workspace/theme/accent'
import { day, points } from '../lib/format'
import { memberPath } from '../lib/links'
import type { TierRef } from '../lib/types'
import { TierChip } from '../ui/TierChip'
import { atRiskKey, insightsApi } from './api'
import { quietChoices } from './insightsMath'
import { Card, Empty, LoadFailed, Loading } from './parts'
import type { AtRiskMember } from './types'

/**
 * At risk (spec 2026-10-21 release 2 §5): active members with no activity for a number of days (60 unless the address
 * says otherwise), the longest quiet first, each linked to their page. The server holds the list to its first hundred
 * and says how many there are in all.
 */
export function AtRiskList({ quiet, onQuiet, tiers, theme, locale, timeZone }: {
  quiet: number
  onQuiet: (days: number) => void
  tiers: readonly TierRef[]
  theme: ThemeName
  locale: string
  timeZone: string
}) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: atRiskKey(quiet), queryFn: () => insightsApi.atRisk(quiet), placeholderData: keepPreviousData })
  const data = query.data
  const tierOf = (id: number | null) => tiers.find(tier => tier.id === id) ?? null

  return (
    <Card id="insights-at-risk" title={t('loyalty.insights.at_risk.title', 'At risk')}
      line={t('loyalty.insights.at_risk.line', 'Active members who have gone quiet, the longest quiet first. Earning points or a scan of their card counts as activity.')}>
      <label className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
        {t('loyalty.insights.at_risk.choose', 'No activity for')}
        <select value={quiet} onChange={(e) => onQuiet(Number(e.target.value))}
          className="rounded-lg border border-a-border bg-a-surface px-2.5 py-1.5 text-sm text-a-text">
          {quietChoices(quiet).map(days => (
            <option key={days} value={days}>{t('loyalty.insights.at_risk.days', '{{days}} days', { days })}</option>
          ))}
        </select>
      </label>

      {query.isError && !data && <LoadFailed family="at_risk" error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading rows={2} />}
      {data && data.members.length === 0 && (
        <Empty>{t('loyalty.insights.at_risk.none', 'No active member has been quiet for {{days}} days.', { days: data.days })}</Empty>
      )}
      {data && data.members.length > 0 && (
        <>
          {data.total > data.members.length && (
            <p className="text-sm text-a-text-2">{t('loyalty.insights.at_risk.capped', 'The {{shown}} quietest of {{total}}.', {
              shown: points(data.members.length, locale), total: points(data.total, locale),
            })}</p>
          )}
          <ul data-at-risk="" className={`divide-y divide-a-border overflow-hidden rounded-xl border border-a-border ${query.isFetching ? 'opacity-70' : ''}`}>
            {data.members.map(m => <Row key={m.id} member={m} tier={tierOf(m.tier_id)} theme={theme} locale={locale} timeZone={timeZone} />)}
          </ul>
        </>
      )}
    </Card>
  )
}

/** One quiet member: name and number, tier, points, the day they were last seen and how long ago. */
function Row({ member: m, tier, theme, locale, timeZone }: { member: AtRiskMember; tier: TierRef | null; theme: ThemeName; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  return (
    <li data-member={m.id}>
      <Link to={memberPath(m.id)} className="block space-y-0.5 px-3 py-2.5 hover:bg-a-surface-2">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-a-text">{m.name || m.email || `#${m.id}`}</span>
          <span className="flex min-w-0 shrink items-center"><TierChip tier={tier} theme={theme} size="sm" /></span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-a-text">{t('loyalty.common.points_count', '{{points}} pts', { points: points(m.points, locale) })}</span>
        </span>
        <span className="block text-xs text-a-text-2">
          {t('loyalty.insights.at_risk.last_seen', 'Last seen {{day}} · days quiet: {{days}}', { day: day(m.last_activity_at, locale, timeZone), days: points(m.days_quiet, locale) })}
        </span>
      </Link>
    </li>
  )
}
