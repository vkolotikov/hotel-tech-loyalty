import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { formatDate } from '../../workspace/lib/wallClock'
import { points } from '../lib/format'
import { cohortsKey, insightsApi } from './api'
import { cohortOffsets, heatStep, noCohorts, retentionShare } from './insightsMath'
import { Card, Empty, LoadFailed, Loading } from './parts'
import type { Cohorts } from './types'

/**
 * Cohort retention (release 4 part E): the members of each of the last twelve venue months by the month they joined,
 * and the share of them active — who earned or spent points — in that month and each month after, shaded by the share.
 * The counts are the server's (InsightsCohorts); the share is written in every cell, the shade only repeats it.
 */
export function CohortsCard({ locale }: { locale: string }) {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: cohortsKey, queryFn: insightsApi.cohorts })
  const data = query.data

  return (
    <Card id="insights-cohorts" title={t('loyalty.insights.cohorts.title', 'Cohort retention')}
      line={t('loyalty.insights.cohorts.line', 'Members by the month they joined, and the share of them who earned or spent points in that month and each month after. The last twelve months.')}>
      {query.isError && !data && <LoadFailed family="load" error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading rows={1} />}
      {data && <CohortsTable data={data} locale={locale} />}
    </Card>
  )
}

export function CohortsTable({ data, locale }: { data: Cohorts; locale: string }) {
  const { t } = useTranslation()
  if (noCohorts(data.rows)) {
    return <Empty>{t('loyalty.insights.cohorts.none', 'Nobody joined in the last twelve months.')}</Empty>
  }
  const offsets = cohortOffsets(data.rows)
  const month = (key: string) => formatDate(`${key}-01`, locale || 'en', { month: 'short', year: 'numeric' })

  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table data-chart="cohorts" className="w-full min-w-[40rem] border-separate border-spacing-0.5 text-xs tabular-nums">
        <caption className="sr-only">{t('loyalty.insights.cohorts.title', 'Cohort retention')}</caption>
        <thead>
          <tr className="text-a-text-2">
            <th scope="col" className="px-2 py-1 text-left font-medium">{t('loyalty.insights.cohorts.joined', 'Joined')}</th>
            <th scope="col" className="px-2 py-1 text-right font-medium">{t('loyalty.insights.cohorts.members', 'Members')}</th>
            {offsets.map(k => (
              <th key={k} scope="col" className="px-1.5 py-1 text-center font-medium">
                {k === 0 ? t('loyalty.insights.cohorts.month_zero', 'Month joined') : t('loyalty.insights.cohorts.month_after', '+{{months}}', { months: k })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map(row => (
            <tr key={row.key} data-cohort={row.key}>
              <th scope="row" className="whitespace-nowrap px-2 py-1 text-left font-medium text-a-text">{month(row.key)}</th>
              <td className="px-2 py-1 text-right text-a-text">{points(row.members, locale)}</td>
              {offsets.map(k => {
                if (k >= row.active.length) return <td key={k} aria-hidden />
                const share = retentionShare(row.active[k], row.members)
                return (
                  <td key={k} data-share={share ?? ''} className={`rounded px-1.5 py-1 text-center text-a-text ${heatStep(share) > 0 ? `l-heat-${heatStep(share)}` : ''}`}
                    title={share === null ? undefined : t('loyalty.insights.cohorts.cell', '{{active}} of {{members}} active', { active: points(row.active[k], locale), members: points(row.members, locale) })}>
                    {share === null ? '–' : `${share}%`}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
