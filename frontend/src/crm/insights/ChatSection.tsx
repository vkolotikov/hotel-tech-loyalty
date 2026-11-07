import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bot, Clock, FileText, Globe, Hand, MessagesSquare, MessageSquareText, Filter, Activity, UserPlus } from 'lucide-react'
import { get, params } from '../lib/api'
import { count as countOf } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { BarList, ChangeLine, Columns, Legend } from './charts'
import {
  bucketLabel, busiestHour, countChange, countryName, funnelRows, hourRows, rate, rateChange, shortPath, statusRows, trendBuckets,
  type Period,
} from './insightsMath'
import type { ChatAnalytics } from './types'

const STATUS_FALLBACK: Record<string, string> = { waiting: 'Waiting', active: 'Active', resolved: 'Resolved', archived: 'Archived' }
const FUNNEL_FALLBACK: Record<string, string> = {
  conversations: 'Conversations', engaged: 'The visitor wrote', with_contact: 'Left an email or phone', lead_captured: 'Became a lead',
}

/** How the website chat did in the period (GET chatbot/analytics?days=): the server's figures, compared with the period before. */
export function ChatSection({ days }: { days: Period }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const chat = useQuery({
    queryKey: ['crm', 'insights', 'chat', days],
    queryFn: () => get<ChatAnalytics>(`chatbot/analytics${params({ days })}`),
    staleTime: 60_000,
  })
  const n = (value: number) => countOf(value, lang)

  return (
    <section aria-labelledby="crm-insights-chat" className="space-y-4">
      <h2 id="crm-insights-chat" className="font-a-display text-2xl text-a-text">{t('crm.insights.chat_title', 'The website chat')}</h2>
      <QueryState loading={chat.isLoading} error={chat.error} onRetry={() => { void chat.refetch() }}>
        {chat.data && (chat.data.overview.total_conversations === 0 && chat.data.previous_overview.total_conversations === 0
          ? (
            <Card>
              <EmptyState icon={MessagesSquare} title={t('crm.insights.no_chats', 'No conversations in these days')}
                line={t('crm.insights.no_chats_line', 'Once visitors write to you on your website, how the chat does shows here.')}
                action={<Link to="/crm/widget" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.insights.to_widget', 'Set up the chat widget')}</Link>} />
            </Card>
          )
          : <ChatBody data={chat.data} days={days} lang={lang} n={n} />)}
      </QueryState>
    </section>
  )
}

function ChatBody({ data, days, lang, n }: { data: ChatAnalytics; days: Period; lang: string; n: (v: number) => string }) {
  const { t } = useTranslation()
  const now = data.overview
  const before = data.previous_overview
  const buckets = trendBuckets(data.trend)
  const weekly = buckets.length !== data.trend.length
  const peak = buckets.reduce<(typeof buckets)[number] | null>((best, b) => (b.total > (best?.total ?? 0) ? b : best), null)
  const hours = hourRows(data.hourly_distribution)
  const busiest = busiestHour(hours)
  const aiName = t('crm.insights.closed_by_ai', 'Closed by the AI')
  const restName = t('crm.insights.other_chats', 'The other conversations')
  const statuses = statusRows(data.status_breakdown)
  const funnel = funnelRows(data.funnel)

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatTile icon={MessagesSquare} tone="progress" label={t('crm.insights.conversations', 'Conversations')} value={n(now.total_conversations)}
          hint={<ChangeLine change={countChange(now.total_conversations, before.total_conversations)} upIsGood days={days} />} />
        <StatTile icon={UserPlus} tone="accent" label={t('crm.insights.leads_from_chat', 'Leads from the chat')} value={n(now.leads_captured)}
          hint={<ChangeLine change={countChange(now.leads_captured, before.leads_captured)} upIsGood days={days} />} />
        <StatTile icon={Bot} tone="ai" label={aiName} value={rate(now.ai_resolution_rate, lang)}
          hint={<ChangeLine change={rateChange(now.ai_resolution_rate, before.ai_resolution_rate, before.total_conversations)} upIsGood days={days} />} />
        <StatTile icon={Hand} tone="pending" label={t('crm.insights.handed_over', 'Handed to your team')} value={n(now.human_escalated)}
          hint={t('crm.insights.share_of_chats', '{{rate}} of the conversations', { rate: rate(now.human_escalation_rate, lang) })} />
        <StatTile icon={MessageSquareText} label={t('crm.insights.avg_messages', 'Messages per conversation')}
          value={new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(now.avg_messages)}
          hint={t('crm.insights.lead_rate', '{{rate}} became leads', { rate: rate(now.lead_conversion_rate, lang) })} />
      </div>

      <Card title={weekly ? t('crm.insights.by_week', 'Conversations by week') : t('crm.insights.by_day', 'Conversations by day')} icon={Activity}
        action={<Legend items={[{ name: aiName, tone: 'ai' }, { name: restName, tone: 'accent' }]} />}>
        <p className="mb-3 text-sm text-a-text-2">
          {peak
            ? t('crm.insights.trend_line', '{{total}} conversations, {{ai}} closed by the AI. The busiest was {{when}}, with {{most}}.', {
              total: n(now.total_conversations), ai: n(now.ai_resolved), when: bucketLabel(peak, lang), most: n(peak.total),
            })
            : t('crm.insights.trend_empty', 'No conversations in these days.')}
        </p>
        <Columns caption={t('crm.insights.trend_caption', 'Conversations, and those closed by the AI')}
          heading={weekly ? t('crm.insights.week', 'Week') : t('crm.insights.day', 'Day')} format={n}
          columns={buckets.map(b => ({
            key: b.key, label: bucketLabel({ from: b.from, to: b.from }, lang), long: bucketLabel(b, lang),
            parts: [{ name: aiName, value: b.ai, tone: 'ai' as const }, { name: restName, value: Math.max(0, b.total - b.ai), tone: 'accent' as const }],
          }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('crm.insights.statuses', 'Where the conversations are now')} icon={MessagesSquare}>
          {statuses.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>
            : <BarList label={t('crm.insights.statuses', 'Where the conversations are now')}
                rows={statuses.map(s => ({ id: s.key, label: s.known ? t(`crm.status.${s.key}`, STATUS_FALLBACK[s.key]) : s.key, value: s.count, text: n(s.count), tone: s.key === 'resolved' ? 'won' : 'accent' }))} />}
        </Card>
        <Card title={t('crm.insights.chat_funnel', 'From a conversation to a lead')} icon={Filter}>
          <BarList label={t('crm.insights.chat_funnel', 'From a conversation to a lead')}
            rows={funnel.map(step => ({
              id: step.stage, label: t(`crm.insights.funnel.${step.stage}`, FUNNEL_FALLBACK[step.stage] ?? step.stage), value: step.count,
              text: step.share === null || step.stage === 'conversations' ? n(step.count) : `${n(step.count)} · ${step.share} %`,
              tone: step.stage === 'lead_captured' ? 'won' : 'accent',
            }))} />
        </Card>
        <Card title={t('crm.insights.top_pages', 'Pages where chats start')} icon={FileText}>
          {data.top_pages.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.no_pages', 'No page was recorded for these conversations.')}</p>
            : <BarList label={t('crm.insights.top_pages', 'Pages where chats start')}
                rows={data.top_pages.map(p => ({ id: p.page_url, label: shortPath(p.page_url), title: p.page_url, value: Number(p.count) || 0, text: n(Number(p.count) || 0) }))} />}
        </Card>
        <Card title={t('crm.insights.countries', 'Where visitors write from')} icon={Globe}>
          {data.top_countries.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.insights.no_countries', 'No country was recorded for these conversations.')}</p>
            : <BarList label={t('crm.insights.countries', 'Where visitors write from')}
                rows={data.top_countries.map(c => ({ id: c.country, label: countryName(c.country, lang), value: Number(c.count) || 0, text: n(Number(c.count) || 0) }))} />}
        </Card>
      </div>

      <Card title={t('crm.insights.hours', 'By hour of the day')} icon={Clock}>
        <p className="mb-3 text-sm text-a-text-2">
          {busiest === null
            ? t('crm.insights.hours_empty', 'No messages in these days.')
            : t('crm.insights.hours_line', 'Busiest around {{hour}}:00. Hours are in UTC, the server’s clock.', { hour: String(busiest).padStart(2, '0') })}
        </p>
        <Columns caption={t('crm.insights.hours_caption', 'Conversations with a message, by hour (UTC)')} heading={t('crm.insights.hour', 'Hour')} format={n}
          labels={hours.map(h => h.hour % 6 === 0)}
          columns={hours.map(h => ({ key: String(h.hour), label: h.label, long: `${h.label}:00`, parts: [{ name: t('crm.insights.conversations', 'Conversations'), value: h.count, tone: 'accent' as const }] }))} />
      </Card>
    </div>
  )
}
