import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Activity, Bot, CalendarDays, Clock, FileText, Filter, Globe, Hand, MessagesSquare, Ruler, Tags, UserPlus } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { count as countOf } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { QueryState } from '../ui/QueryState'
import { StatRow, StatTile } from '../ui/StatTile'
import { BarList, ChangeLine, Columns, Legend } from './charts'
import {
  bucketLabel, busiestHour, busiestWeekday, countChange, countryName, funnelRows, hourRows, intentRows, lengthRows, rate, rateChange, shortPath,
  statusRows, trendBuckets, weekdayName, weekdayRows, zoneLabel, type Period,
} from './insightsMath'
import type { ChatAnalytics } from './types'

const STATUS_FALLBACK: Record<string, string> = { waiting: 'Waiting', active: 'Active', resolved: 'Resolved', archived: 'Archived' }
const FUNNEL_FALLBACK: Record<string, string> = {
  conversations: 'Conversations', engaged: 'The visitor wrote', with_contact: 'Left an email or phone', lead_captured: 'Became a lead',
}
const INTENT_FALLBACK: Record<string, string> = {
  booking_inquiry: 'Wants to book', info_request: 'Asks for information', complaint: 'Complaint', cancellation: 'Cancellation',
  support: 'Needs help', spam: 'Spam', other: 'Other', untagged: 'Not sorted yet',
}

/** How the website chat did in the period (GET chatbot/analytics?days=): the server's figures, against the period before. */
export function ChatSection({ days }: { days: Period }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const chat = useQuery({
    queryKey: ['crm', 'insights', 'chat', days],
    queryFn: () => get<ChatAnalytics>(`chatbot/analytics${params({ days })}`),
    staleTime: 60_000,
  })
  const n = (value: number) => countOf(value, lang)

  return (
    <section aria-label={t('crm.insights.chat_title', 'The website chat')} className="space-y-4">
      <QueryState loading={chat.isLoading} error={chat.error} onRetry={() => { void chat.refetch() }}>
        {chat.data && (chat.data.overview.total_conversations === 0 && chat.data.previous_overview.total_conversations === 0
          ? (
            <Card>
              <EmptyState icon={MessagesSquare} title={t('crm.insights.no_chats', 'No conversations in these days')}
                action={<Link to="/crm/widget" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.insights.to_widget', 'Set up the chat widget')}</Link>} />
            </Card>
          )
          : <ChatBody data={chat.data} days={days} lang={lang} n={n} zone={zoneLabel(boot.venue.timezone)} />)}
      </QueryState>
    </section>
  )
}

function ChatBody({ data, days, lang, n, zone }: { data: ChatAnalytics; days: Period; lang: string; n: (v: number) => string; zone: string }) {
  const { t } = useTranslation()
  const now = data.overview
  const before = data.previous_overview
  const buckets = trendBuckets(data.trend)
  const weekly = buckets.length !== data.trend.length
  const peak = buckets.reduce<(typeof buckets)[number] | null>((best, b) => (b.total > (best?.total ?? 0) ? b : best), null)
  const hours = hourRows(data.hourly_distribution)
  const busiest = busiestHour(hours)
  const weekdays = weekdayRows(data.weekday_distribution, lang)
  const busiestDay = busiestWeekday(weekdays)
  const intents = intentRows(data.intent_breakdown)
  const lengths = lengthRows(data.length_distribution)
  const aiName = t('crm.insights.closed_by_ai', 'Closed by the AI')
  const restName = t('crm.insights.other_chats', 'The other conversations')
  const statuses = statusRows(data.status_breakdown)
  const funnel = funnelRows(data.funnel)
  const nothing = <p className="text-sm text-a-text-2">{t('crm.insights.nothing', 'Nothing in these days.')}</p>

  return (
    <div className="space-y-4">
      <StatRow label={t('crm.insights.chat_title', 'The website chat')} count={4}>
        <StatTile icon={MessagesSquare} tone="progress" label={t('crm.insights.conversations', 'Conversations')} value={n(now.total_conversations)}
          hint={<ChangeLine change={countChange(now.total_conversations, before.total_conversations)} upIsGood days={days} />} />
        <StatTile icon={UserPlus} tone="accent" label={t('crm.insights.leads_from_chat', 'Leads from the chat')} value={n(now.leads_captured)}
          hint={<ChangeLine change={countChange(now.leads_captured, before.leads_captured)} upIsGood days={days} />} />
        <StatTile icon={Bot} tone="ai" label={aiName} value={rate(now.ai_resolution_rate, lang)}
          hint={<ChangeLine change={rateChange(now.ai_resolution_rate, before.ai_resolution_rate, before.total_conversations)} upIsGood days={days} />} />
        <StatTile icon={Hand} tone="pending" label={t('crm.insights.handed_over', 'Handed to your team')} value={n(now.human_escalated)}
          hint={rate(now.human_escalation_rate, lang)} />
      </StatRow>

      <Card title={weekly ? t('crm.insights.by_week', 'Conversations by week') : t('crm.insights.by_day', 'Conversations by day')} icon={Activity} tone="accent"
        description={t('crm.insights.trend_desc', 'Those the assistant closed are in violet')}
        hint={peak ? t('crm.insights.peak', 'Busiest: {{when}} · {{most}}', { when: bucketLabel(peak, lang), most: n(peak.total) }) : undefined}
        action={<div className="hidden sm:block"><Legend items={[{ name: aiName, tone: 'ai' }, { name: restName, tone: 'accent' }]} /></div>}>
        <Columns caption={t('crm.insights.trend_caption', 'Conversations, and those closed by the AI')}
          heading={weekly ? t('crm.insights.week', 'Week') : t('crm.insights.day', 'Day')} format={n}
          columns={buckets.map(b => ({
            key: b.key, label: bucketLabel({ from: b.from, to: b.from }, lang), long: bucketLabel(b, lang),
            parts: [{ name: aiName, value: b.ai, tone: 'ai' as const }, { name: restName, value: Math.max(0, b.total - b.ai), tone: 'accent' as const }],
          }))} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('crm.insights.intents', 'What visitors want')} icon={Tags} tone="ai"
          description={t('crm.insights.intents_desc', 'The intent the AI read in each conversation of the period')}>
          {intents.length === 0 ? nothing
            : <BarList label={t('crm.insights.intents', 'What visitors want')}
                rows={intents.map(r => ({ id: r.key, label: r.known ? t(`crm.insights.intent.${r.key}`, INTENT_FALLBACK[r.key]) : r.key, value: r.count, text: n(r.count), tone: r.key === 'untagged' ? 'muted' : 'ai' }))} />}
        </Card>
        <Card title={t('crm.insights.weekdays', 'By day of the week')} icon={CalendarDays} tone="progress"
          description={t('crm.insights.hours_desc', 'In the venue’s time: {{zone}}', { zone })}
          hint={busiestDay !== null ? t('crm.insights.busiest_short', 'Busiest: {{when}}', { when: weekdayName(busiestDay, lang) }) : undefined}>
          <Columns caption={t('crm.insights.weekdays', 'By day of the week')} heading={t('crm.insights.day', 'Day')} format={n} labels={weekdays.map(() => true)}
            columns={weekdays.map(d => ({ key: String(d.dow), label: d.label, long: d.label, parts: [{ name: t('crm.insights.conversations', 'Conversations'), value: d.count, tone: 'accent' as const }] }))} />
        </Card>
        <Card title={t('crm.insights.hours', 'By hour of the day')} icon={Clock} tone="pending"
          description={t('crm.insights.hours_desc', 'In the venue’s time: {{zone}}', { zone })}
          hint={busiest !== null ? t('crm.insights.busiest_short', 'Busiest: {{when}}', { when: `${String(busiest).padStart(2, '0')}:00` }) : undefined}>
          <Columns caption={t('crm.insights.hours_caption_zone', 'Conversations with a message, by hour ({{zone}})', { zone })} heading={t('crm.insights.hour', 'Hour')} format={n}
            labels={hours.map(h => h.hour % 6 === 0)}
            columns={hours.map(h => ({ key: String(h.hour), label: h.label, long: `${h.label}:00`, parts: [{ name: t('crm.insights.conversations', 'Conversations'), value: h.count, tone: 'accent' as const }] }))} />
        </Card>
        <Card title={t('crm.insights.lengths', 'How long they talk')} icon={Ruler} tone="neutral"
          description={t('crm.insights.lengths_desc', 'Conversations by their number of messages')}
          hint={t('crm.insights.avg_short', '{{value}} per chat', { value: new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(now.avg_messages) })}>
          {lengths.every(l => l.count === 0) ? nothing
            : <BarList label={t('crm.insights.lengths', 'How long they talk')}
                rows={lengths.map(l => ({ id: l.key, label: l.key === 'none' ? t('crm.insights.length_none', 'No message') : t('crm.insights.length_messages', '{{range}} messages', { range: l.label }), value: l.count, text: n(l.count) }))} />}
        </Card>
        <Card title={t('crm.insights.statuses', 'Where the conversations are now')} icon={MessagesSquare} tone="progress"
          description={t('crm.insights.statuses_desc', 'The state of this period’s conversations today')}>
          {statuses.length === 0 ? nothing
            : <BarList label={t('crm.insights.statuses', 'Where the conversations are now')}
                rows={statuses.map(s => ({ id: s.key, label: s.known ? t(`crm.status.${s.key}`, STATUS_FALLBACK[s.key]) : s.key, value: s.count, text: n(s.count), tone: s.key === 'resolved' ? 'won' : 'accent' }))} />}
        </Card>
        <Card title={t('crm.insights.chat_funnel', 'From a conversation to a lead')} icon={Filter} tone="success"
          description={t('crm.insights.funnel_desc', 'How many got to each step, and their share of all')}
          hint={rate(now.lead_conversion_rate, lang)}>
          <BarList label={t('crm.insights.chat_funnel', 'From a conversation to a lead')}
            rows={funnel.map(step => ({
              id: step.stage, label: t(`crm.insights.funnel.${step.stage}`, FUNNEL_FALLBACK[step.stage] ?? step.stage), value: step.count,
              text: step.share === null || step.stage === 'conversations' ? n(step.count) : `${n(step.count)} · ${step.share} %`,
              tone: step.stage === 'lead_captured' ? 'won' : 'accent',
            }))} />
        </Card>
        <Card title={t('crm.insights.top_pages', 'Pages where chats start')} icon={FileText}
          description={t('crm.insights.pages_desc', 'The page a visitor was on when they wrote')}>
          {data.top_pages.length === 0 ? nothing
            : <BarList label={t('crm.insights.top_pages', 'Pages where chats start')}
                rows={data.top_pages.map(p => ({ id: p.page_url, label: shortPath(p.page_url), title: p.page_url, value: Number(p.count) || 0, text: n(Number(p.count) || 0) }))} />}
        </Card>
        <Card title={t('crm.insights.countries', 'Where visitors write from')} icon={Globe}
          description={t('crm.insights.countries_desc', 'From each visitor’s internet address')}>
          {data.top_countries.length === 0 ? nothing
            : <BarList label={t('crm.insights.countries', 'Where visitors write from')}
                rows={data.top_countries.map(c => ({ id: c.country, label: countryName(c.country, lang), value: Number(c.count) || 0, text: n(Number(c.count) || 0) }))} />}
        </Card>
      </div>
    </div>
  )
}
