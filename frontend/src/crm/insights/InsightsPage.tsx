import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarRange, MessagesSquare, Target } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { Page } from '../ui/Page'
import { SectionNav, type Section } from '../ui/SectionNav'
import { Tabs } from '../ui/Tabs'
import { Toolbar } from '../ui/Toolbar'
import { ChatSection } from './ChatSection'
import { PERIODS, arg, periodOf, sectionOf, type InsightsSection } from './insightsMath'
import { PipelineSection } from './PipelineSection'

const PANEL = 'crm-insights-panel'
const PREFIX = 'crm-insights-section'

/**
 * Insights (2026-11-07; round 2, "structured sections"): how the website chat and the pipeline are doing, as two
 * sections (`?tab=chat|pipeline`), over 7, 30 or 90 days (the period switch in the toolbar, `?days=`), each figure
 * against the period before. Rebuilt from the full admin's Chatbot analytics, Pipeline insights and Deals analytics on
 * the same endpoints; every figure is the server's.
 */
export function InsightsPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const days = periodOf(arg(search, 'days'))
  const fallback: InsightsSection = boot.features.chatbot ? 'chat' : 'pipeline'
  const tab = sectionOf(arg(search, 'tab'), fallback)
  const set = (key: string, value: string | null) => setSearch(prev => {
    const out = new URLSearchParams(prev)
    if (value === null) out.delete(key)
    else out.set(key, value)
    return out
  }, { replace: true })

  const sections: Section<InsightsSection>[] = [
    { key: 'chat', icon: MessagesSquare, tone: 'ai', title: t('crm.insights.chat_title', 'The website chat'), caption: t('crm.insights.chat_caption', 'Conversations, the assistant’s share and the leads it brought') },
    { key: 'pipeline', icon: Target, tone: 'progress', title: t('crm.insights.pipeline_title', 'Your pipeline'), caption: t('crm.insights.pipeline_caption', 'New leads, where they stand, and what needs attention') },
  ]

  return (
    <Page title={t('crm.nav.insights', 'Insights')} line={t('crm.insights.line', 'How the website chat and your pipeline are doing.')}>
      <SectionNav label={t('crm.insights.sections', 'Insights sections')} idPrefix={PREFIX} panelId={PANEL} sections={sections} value={tab}
        onChange={next => set('tab', next === fallback ? null : next)} />

      <div id={PANEL} role="tabpanel" aria-labelledby={`${PREFIX}-${tab}`} className="space-y-4">
        <Toolbar>
          <span className="inline-flex items-center gap-2 px-1 text-sm font-medium text-a-text-2">
            <CalendarRange size={15} aria-hidden />{t('crm.insights.period', 'Period')}
          </span>
          <Tabs label={t('crm.insights.period', 'Period')} value={String(days)} onChange={next => set('days', next === '30' ? null : next)}
            items={PERIODS.map(d => ({ key: String(d), label: t('crm.insights.days', '{{days}} days', { days: d }) }))} />
          <span className="text-xs text-a-text-2 sm:ml-auto sm:pr-1">
            {tab === 'chat'
              ? t('crm.insights.period_chat', 'Each figure against the {{days}} days before', { days })
              : t('crm.insights.period_pipeline', 'The period counts new leads; the rest is the pipeline now')}
          </span>
        </Toolbar>

        <div key={tab} className="animate-a-fade">
          {tab === 'chat' ? <ChatSection days={days} /> : <PipelineSection days={days} />}
        </div>
      </div>
    </Page>
  )
}
