import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Activity, AlertTriangle, BarChart3, Coins, Gauge, Layers, PiggyBank } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { QueryState } from '../ui/QueryState'
import { StatRow, StatTile } from '../ui/StatTile'
import { INTEGRATION_KEYS, integrationsApi } from './integrationsApi'
import {
  budgetTone, dayBars, dayOfMonth, featureFallback, featureRows, isKnownFeature, leftCents, meterWidth, planPackages, usd,
  type AiUsage, type MeterTone,
} from './integrationsLogic'

const METER: Record<MeterTone, string> = {
  success: 'bg-a-st-confirmed',
  pending: 'bg-a-st-pending',
  danger: 'bg-a-danger',
  neutral: 'bg-a-accent',
}

/**
 * AI usage (round 5): this month's AI spend against the plan's allowance — the one budget the website assistant, the
 * inbox's drafts, the AI capture and every other AI feature spend (CRM packages are sold by it) — by the venue's day and
 * by feature. Every figure is the server's (`crm/ai-usage`, AiUsageService); the allowance is in US dollars, as billed.
 */
export function AiUsageTab() {
  const query = useQuery({ queryKey: INTEGRATION_KEYS.ai, queryFn: integrationsApi.aiUsage, refetchInterval: 60_000 })
  return (
    <QueryState loading={query.isLoading} error={query.error} onRetry={() => { void query.refetch() }} rows={4}>
      {query.data && <Usage usage={query.data} />}
    </QueryState>
  )
}

function Usage({ usage }: { usage: AiUsage }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language || 'en'
  const money = (cents: number) => usd(cents, lang)
  const { budget } = usage
  const width = meterWidth(budget)
  const left = leftCents(budget)
  const tone = budgetTone(budget.status)
  const packages = planPackages(usage.plan)
  const bars = dayBars(usage.by_day, usage.today || boot.venue.today)
  const features = featureRows(usage.by_feature)
  const anySpend = budget.used_cents > 0 || usage.calls > 0

  return (
    <div className="space-y-4">
      <StatRow count={3} label={t('crm.integrations.ai.figures', 'This month')}>
        <StatTile icon={Coins} tone="ai" label={t('crm.integrations.ai.spent', 'Spent this month')} value={money(budget.used_cents)}
          hint={budget.cap_cents !== null ? t('crm.integrations.ai.of', 'of {{cap}}', { cap: money(budget.cap_cents) }) : undefined} />
        <StatTile icon={PiggyBank} tone={tone === 'danger' ? 'danger' : tone === 'pending' ? 'pending' : 'success'} label={t('crm.integrations.ai.left', 'Left')}
          value={left !== null ? money(left) : '∞'} hint={left === null ? t('crm.integrations.ai.unlimited', 'No limit') : undefined} />
        <StatTile icon={Activity} tone="neutral" label={t('crm.integrations.ai.calls', 'AI calls')} value={usage.calls.toLocaleString(lang)} />
      </StatRow>

      <Card title={t('crm.integrations.ai.allowance', 'Allowance')} icon={Gauge} tone="ai"
        description={t('crm.integrations.ai.allowance_about', 'One budget for every AI feature. It starts again on the 1st of each month.')}
        hint={packages.length > 0 ? packages.map(p => `${moduleName(t, p.module)} ${tierName(t, p.tier)}`).join(' + ') : undefined}>
        {width === null ? (
          <p className="text-sm text-a-text-2">{t('crm.integrations.ai.no_cap', 'Your plan sets no AI limit.')}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-a-text">{t('crm.integrations.ai.used', '{{percent}} % used', { percent: budget.percent ?? width })}</span>
              <span className="text-a-text-2">{money(budget.used_cents)} / {money(budget.cap_cents ?? 0)}</span>
            </div>
            <div role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-label={t('crm.integrations.ai.allowance', 'Allowance')}
              className="h-2.5 w-full overflow-hidden rounded-full bg-a-surface-2">
              <div className={`h-full rounded-full ${METER[tone]}`} style={{ width: `${width}%` }} />
            </div>
            {budget.status === 'warn' && (
              <p className="flex items-center gap-2 text-sm text-a-st-pending"><AlertTriangle size={15} aria-hidden />{t('crm.integrations.ai.warn', 'Over 80 % used this month.')}</p>
            )}
            {budget.status === 'over' && (
              <p className="flex items-center gap-2 text-sm text-a-danger"><AlertTriangle size={15} aria-hidden />{t('crm.integrations.ai.over', 'Used up: the assistant hands every chat to your team and AI drafts stop until the 1st.')}</p>
            )}
          </div>
        )}
      </Card>

      {!anySpend ? (
        <Card>
          <EmptyState icon={BarChart3} title={t('crm.integrations.ai.empty', 'No AI spend yet this month')} />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card title={t('crm.integrations.ai.by_day', 'By day')} icon={BarChart3} tone="accent"
            description={t('crm.integrations.ai.by_day_about', 'Each day on your venue\'s clock.')}>
            <ol className="flex h-40 items-end gap-[3px]" aria-label={t('crm.integrations.ai.by_day', 'By day')}>
              {bars.map(bar => {
                const label = t('crm.integrations.ai.day_bar', '{{day}}: {{cost}}, {{calls}} calls', { day: bar.day, cost: money(bar.cost_cents), calls: bar.calls })
                return (
                  <li key={bar.day} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1" title={label}>
                    <span className="sr-only">{label}</span>
                    <span aria-hidden className={`w-full rounded-t-md ${bar.today ? 'crm-ai-fill' : bar.cost_cents > 0 ? 'bg-a-accent/70' : 'bg-a-surface-2'}`}
                      style={{ height: `${bar.cost_cents > 0 ? bar.height : 2}%` }} />
                  </li>
                )
              })}
            </ol>
            <div aria-hidden className="mt-1 flex gap-[3px] text-xs text-a-text-2">
              {bars.map((bar, i) => {
                const n = dayOfMonth(bar.day)
                const show = i === 0 || bar.today || n % 5 === 0
                return <span key={bar.day} className={`min-w-0 flex-1 text-center ${bar.today ? 'font-semibold text-a-text' : ''}`}>{show ? n : ''}</span>
              })}
            </div>
          </Card>

          <Card padded={false} title={t('crm.integrations.ai.by_feature', 'By feature')} icon={Layers} tone="ai">
            <ul className="divide-y divide-a-border">
              {features.map(row => (
                <li key={row.feature} className="px-4 py-2.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-a-text">{featureName(t, row.feature)}</span>
                    <span className="shrink-0 font-medium text-a-text">{money(row.cost_cents)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span aria-hidden className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-a-surface-2">
                      <span className="block h-full rounded-full crm-ai-fill" style={{ width: `${Math.max(row.share, row.cost_cents > 0 ? 2 : 0)}%` }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-xs text-a-text-2">
                      {t('crm.integrations.ai.feature_line', '{{share}} % · {{calls}} calls', { share: row.share, calls: row.calls.toLocaleString(lang) })}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  )
}

function moduleName(t: TFunction, module: string): string {
  switch (module) {
    case 'crm': return t('crm.integrations.ai.module.crm', 'HexaTech CRM')
    case 'content': return t('crm.integrations.ai.module.content', 'HexaTech Content')
    case 'time': return t('crm.integrations.ai.module.time', 'HexaTech Time Planner')
    case 'loyalty': return t('crm.integrations.ai.module.loyalty', 'HexaTech Loyalty')
    case 'appointments': return t('crm.integrations.ai.module.appointments', 'HexaTech Appointments')
    default: return module
  }
}

function tierName(t: TFunction, tier: string): string {
  switch (tier) {
    case 'lite': return t('crm.integrations.ai.tier.lite', 'Lite')
    case 'pro': return t('crm.integrations.ai.tier.pro', 'Pro')
    default: return t('crm.integrations.ai.tier.standard', 'Standard')
  }
}

/** A feature's name in the person's language; one the bundle does not know shows as the ledger names it. */
function featureName(t: TFunction, feature: string): string {
  if (!isKnownFeature(feature)) return featureFallback(feature)
  switch (feature) {
    case 'website_chatbot': return t('crm.integrations.feature.website_chatbot', 'Website assistant')
    case 'website_chatbot_tools': return t('crm.integrations.feature.website_chatbot_tools', 'Website assistant: bookings and look-ups')
    case 'messenger_chat': return t('crm.integrations.feature.messenger_chat', 'Messenger replies')
    case 'member_chat': return t('crm.integrations.feature.member_chat', 'Member app assistant')
    case 'chatbot_test': return t('crm.integrations.feature.chatbot_test', 'Trying the assistant')
    case 'chat': return t('crm.integrations.feature.chat', 'AI chat')
    case 'crm_chat': return t('crm.integrations.feature.crm_chat', 'Staff AI and capture')
    case 'crm_draft': return t('crm.integrations.feature.crm_draft', 'Inbox drafts')
    case 'voice_agent': return t('crm.integrations.feature.voice_agent', 'Voice agent')
    case 'engagement_brief': return t('crm.integrations.feature.engagement_brief', 'Chat briefs')
    case 'engagement_translate': return t('crm.integrations.feature.engagement_translate', 'Translations')
    case 'knowledge_faqs': return t('crm.integrations.feature.knowledge_faqs', 'Answers from documents')
    case 'knowledge_keywords': return t('crm.integrations.feature.knowledge_keywords', 'Keyword suggestions')
    case 'inquiry_smart_panel': return t('crm.integrations.feature.inquiry_smart_panel', 'Lead AI brief')
    case 'inquiry_lost_reason': return t('crm.integrations.feature.inquiry_lost_reason', 'Why a lead was lost')
    case 'inquiry_proposal_draft': return t('crm.integrations.feature.inquiry_proposal_draft', 'Proposal drafts')
    case 'content': return t('crm.integrations.feature.content', 'Content planner')
    case 'time_plan': return t('crm.integrations.feature.time_plan', 'Day plans')
    case 'time_review': return t('crm.integrations.feature.time_review', 'Day reviews')
    case 'time_capture': return t('crm.integrations.feature.time_capture', 'Task capture')
    default: return featureFallback(feature)
  }
}
