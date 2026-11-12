import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, FileBarChart, Handshake, MessagesSquare, Target } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { Tabs } from '../ui/Tabs'
import { ChatSection } from './ChatSection'
import { DealsSection } from './DealsSection'
import { PERIODS, REPORT_MONTHS, arg, monthsOf, periodOf, sectionOf, type InsightsSection } from './insightsMath'
import { PipelineSection } from './PipelineSection'
import { ReportsSection } from './ReportsSection'

const PANEL = 'crm-insights-panel'
const PREFIX = 'crm-insights-section'

/**
 * Insights (2026-11-07; round 5, owner 2026-11-12: "implement all features we have in our main platform … minimize
 * copy"): four sections (`?tab=chat|pipeline|deals|reports`) — the website chat, the pipeline, the deals (the full
 * admin's Deals analytics) and the sales reports (the full admin's Reports) — over 7, 30 or 90 days (`?days=`), the
 * reports over 3, 6 or 12 months (`?months=`), the period switch in the header. Every figure is the server's.
 */
export function InsightsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const days = periodOf(arg(search, 'days'))
  const months = monthsOf(arg(search, 'months'))
  const fallback: InsightsSection = boot.features.chatbot ? 'chat' : 'pipeline'
  const tab = sectionOf(arg(search, 'tab'), fallback)
  const set = (key: string, value: string | null) => setSearch(prev => {
    const out = new URLSearchParams(prev)
    if (value === null) out.delete(key)
    else out.set(key, value)
    return out
  }, { replace: true })

  const sections: Section<InsightsSection>[] = [
    { key: 'chat', icon: MessagesSquare, tone: 'ai', title: t('crm.insights.chat_tab', 'Chat'), caption: t('crm.insights.chat_caption', 'Conversations, the assistant’s share and the leads it brought') },
    { key: 'pipeline', icon: Target, tone: 'progress', title: t('crm.insights.pipeline_tab', 'Pipeline'), caption: t('crm.insights.pipeline_caption', 'New leads, where they stand, and what needs attention') },
    { key: 'deals', icon: Handshake, tone: 'success', title: t('crm.insights.deals_tab', 'Deals'), caption: t('crm.insights.deals_caption', 'Revenue, new deals, steps, payments and the best customers') },
    { key: 'reports', icon: FileBarChart, tone: 'pending', title: t('crm.insights.reports_tab', 'Reports'), caption: t('crm.insights.reports_caption', 'Funnel, forecast, lost reasons, sources, the team and companies') },
  ]

  const period = tab === 'reports'
    ? <Tabs label={t('crm.insights.period', 'Period')} value={String(months)} onChange={next => set('months', next === '6' ? null : next)}
        items={REPORT_MONTHS.map(m => ({ key: String(m), label: t('crm.insights.months_short', '{{count}} mo', { count: m }) }))} />
    : <Tabs label={t('crm.insights.period', 'Period')} value={String(days)} onChange={next => set('days', next === '30' ? null : next)}
        items={PERIODS.map(d => ({ key: String(d), label: t('crm.insights.days_short', '{{count}} d', { count: d }) }))} />

  return (
    // The period sits at the header's end on a wide screen and under the title on a phone, so the title keeps its width.
    <Page icon={BarChart3} title={t('crm.nav.insights', 'Insights')} line={t('crm.insights.line', 'How the website chat and your pipeline are doing.')}
      actions={<div className="hidden sm:block">{period}</div>} below={<div className="sm:hidden">{period}</div>}>
      <SectionNav label={t('crm.insights.sections', 'Insights sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab}
        onChange={next => set('tab', next === fallback ? null : next)} />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} key={tab} className="animate-a-fade">
        {tab === 'chat' ? <ChatSection days={days} />
          : tab === 'pipeline' ? <PipelineSection days={days} />
          : tab === 'deals' ? <DealsSection days={days} />
          : <ReportsSection months={months} />}
      </div>
    </Page>
  )
}
