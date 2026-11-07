import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Page } from '../ui/Page'
import { Tabs } from '../ui/Tabs'
import { ChatSection } from './ChatSection'
import { PERIODS, arg, periodOf } from './insightsMath'
import { PipelineSection } from './PipelineSection'

/**
 * Insights (2026-11-07): how the website chat and the pipeline are doing over 7, 30 or 90 days (the period in the
 * address, `?days=`). Rebuilt from the full admin's Chatbot analytics, Pipeline insights and Deals analytics on the
 * same endpoints; every figure is the server's.
 */
export function InsightsPage() {
  const { t } = useTranslation()
  const [search, setSearch] = useSearchParams()
  const days = periodOf(arg(search, 'days'))
  const choose = (next: string) => setSearch(prev => {
    const out = new URLSearchParams(prev)
    if (next === '30') out.delete('days')
    else out.set('days', next)
    return out
  }, { replace: true })

  return (
    <Page title={t('crm.nav.insights', 'Insights')} line={t('crm.insights.line', 'How the website chat and your pipeline are doing.')}
      below={<Tabs label={t('crm.insights.period', 'Period')} value={String(days)} onChange={choose}
        items={PERIODS.map(d => ({ key: String(d), label: t('crm.insights.days', '{{days}} days', { days: d }) }))} />}>
      <ChatSection days={days} />
      <PipelineSection days={days} />
    </Page>
  )
}
