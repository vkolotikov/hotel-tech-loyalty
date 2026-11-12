import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlarmClock, CircleDollarSign, Coins, Filter, Snowflake, Target, Trophy, UserMinus, UserPlus, XCircle, type LucideIcon } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { count as countOf, money } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Card } from '../ui/Card'
import { InfoTip } from '../ui/InfoTip'
import { EmptyState } from '../ui/EmptyState'
import { Select } from '../ui/inputs'
import { QueryState } from '../ui/QueryState'
import { StatRow, StatTile } from '../ui/StatTile'
import { TONE_CHIP, type Tone } from '../ui/tones'
import { BarList, ChangeLine } from './charts'
import { arg, countChange, lostReasonRows, pickPipeline, pipelineSummary, signalName, stageRows, windows, type Period } from './insightsMath'
import type { LeadKpis, LeadPage, LeadSignals, LostReasonCount, Pipeline, SignalLead } from './types'

const INSIGHTS = ['crm', 'insights'] as const

/**
 * How the pipeline is doing (2026-11-07): new leads in the period against the one before (the server's counts of
 * `inquiries` by day), the open pipeline (inquiries/kpis), where the leads stand by stage and the share of closed
 * ones won (pipelines), what needs attention (inquiries/insights), why leads were lost (managers), the best customers
 * (deals/analytics).
 */
export function PipelineSection({ days, now = new Date() }: { days: Period; now?: Date }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const [search, setSearch] = useSearchParams()
  const span = windows(days, now, boot.venue.timezone)
  const n = (value: number) => countOf(value, lang)

  const fresh = useQuery({
    queryKey: [...INSIGHTS, 'new-leads', span.from],
    queryFn: () => get<LeadPage>(`inquiries${params({ date_from: span.from, per_page: 1 })}`),
    staleTime: 60_000,
  })
  const before = useQuery({
    queryKey: [...INSIGHTS, 'new-leads-before', span.prevFrom, span.prevTo],
    queryFn: () => get<LeadPage>(`inquiries${params({ date_from: span.prevFrom, date_to: span.prevTo, per_page: 1 })}`),
    staleTime: 5 * 60_000,
  })
  const kpis = useQuery({ queryKey: [...INSIGHTS, 'kpis'], queryFn: () => get<LeadKpis>('inquiries/kpis'), staleTime: 60_000 })
  const pipelines = useQuery({ queryKey: [...INSIGHTS, 'pipelines'], queryFn: () => get<Pipeline[]>('pipelines'), staleTime: 60_000 })
  const signals = useQuery({ queryKey: [...INSIGHTS, 'signals'], queryFn: () => get<LeadSignals>('inquiries/insights'), staleTime: 5 * 60_000 })

  const chosenId = Number(arg(search, 'pipeline')) || null
  const list = Array.isArray(pipelines.data) ? pipelines.data : []
  const pipeline = pickPipeline(list, chosenId)
  const summary = pipeline ? pipelineSummary(pipeline) : null
  const choosePipeline = (id: string) => setSearch(prev => {
    const next = new URLSearchParams(prev)
    if (id) next.set('pipeline', id)
    else next.delete('pipeline')
    return next
  }, { replace: true })

  return (
    <section aria-label={t('crm.insights.pipeline_title', 'Your pipeline')} className="space-y-4">

      <StatRow label={t('crm.insights.pipeline_title', 'Your pipeline')} count={4}>
        <StatTile icon={UserPlus} tone="accent" label={t('crm.insights.new_leads', 'New leads')}
          value={fresh.data ? n(fresh.data.total) : '—'}
          hint={fresh.data && before.data ? <ChangeLine change={countChange(fresh.data.total, before.data.total)} upIsGood days={days} /> : undefined} />
        <StatTile icon={Target} tone="progress" label={t('crm.insights.open_leads', 'Open leads')} value={kpis.data ? n(kpis.data.total) : '—'}
          hint={kpis.data && kpis.data.overdue > 0 ? t('crm.insights.overdue_short', '{{count}} overdue', { count: kpis.data.overdue }) : undefined} />
        <StatTile icon={Coins} tone="success" label={t('crm.insights.open_value', 'Open pipeline')}
          value={kpis.data ? money(kpis.data.estimated_value, boot.venue.currency, lang) : '—'} />
        <StatTile icon={Trophy} tone="success" label={t('crm.insights.win_rate', 'Win rate')} value={summary?.winRate === null || !summary ? '—' : `${summary.winRate} %`}
          hint={summary ? t('crm.insights.win_rate_short', '{{won}}/{{closed}}', { won: n(summary.won), closed: n(summary.won + summary.lost) }) : undefined} />
      </StatRow>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={t('crm.insights.stages', 'Where your leads are')} icon={Filter} tone="progress" description={t('crm.insights.stages_desc', 'Leads in each stage now')}
          hint={summary ? t('crm.insights.stages_hint', '{{open}} open · {{won}} won · {{lost}} lost', { open: n(summary.open), won: n(summary.won), lost: n(summary.lost) }) : undefined}
          action={list.length > 1 && pipeline ? (
            <label className="flex items-center gap-2 text-xs text-a-text-2">
              <span className="sr-only">{t('crm.insights.pipeline', 'Pipeline')}</span>
              <Select value={String(pipeline.id)} onChange={e => choosePipeline(e.target.value)} className="py-1.5 text-xs">
                {list.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
              </Select>
            </label>
          ) : undefined}>
          <QueryState loading={pipelines.isLoading} error={pipelines.error} onRetry={() => { void pipelines.refetch() }} rows={3}>
            {!pipeline || pipeline.stages.length === 0
              ? <EmptyState icon={Filter} title={t('crm.insights.no_pipeline', 'No pipeline yet')}
                  action={<Link to="/crm/pipeline" className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.insights.to_pipeline', 'Open the pipeline')}</Link>} />
              : (
                <BarList label={t('crm.insights.stages', 'Where your leads are')}
                  rows={stageRows(pipeline).map(s => ({ id: String(s.id), label: s.name, value: s.count, text: n(s.count), tone: s.kind === 'won' ? 'won' : s.kind === 'lost' ? 'lost' : 'accent' }))} />
              )}
          </QueryState>
        </Card>

        <Card title={t('crm.insights.attention', 'Needs attention')} icon={AlarmClock} tone="pending" description={t('crm.insights.attention_desc', 'Open leads that may slip away')} padded={false}>
          <div className={signals.data ? '' : 'p-4'}>
            <QueryState loading={signals.isLoading} error={signals.error} onRetry={() => { void signals.refetch() }} rows={3}>
              {signals.data && (
                <ul className="divide-y divide-a-border">
                  <Signal icon={Snowflake} tone="progress" title={t('crm.insights.cold', 'Going cold')} line={t('crm.insights.cold_line', 'Open, no contact for 7 days or more')}
                    figure={n(signals.data.cold.count)} sample={signals.data.cold.sample} />
                  <Signal icon={UserMinus} tone="pending" title={t('crm.insights.unassigned', 'Nobody on it')} line={t('crm.insights.unassigned_line', 'Open for 3 days or more, no owner')}
                    figure={n(signals.data.unassigned.count)} sample={signals.data.unassigned.sample} />
                  <Signal icon={AlarmClock} tone="danger" title={t('crm.insights.stuck', 'Stuck')} line={t('crm.insights.stuck_line', 'Not changed for 14 days or more')}
                    figure={n(signals.data.stuck.count)} sample={signals.data.stuck.sample} />
                  <Signal icon={CircleDollarSign} tone="success" title={t('crm.insights.high_value', 'Biggest open leads')} line={t('crm.insights.high_value_line', 'The five open leads worth most, together')}
                    figure={money(signals.data.high_value.total, boot.venue.currency, lang)} sample={signals.data.high_value.sample} />
                </ul>
              )}
            </QueryState>
          </div>
        </Card>

        {boot.staff.can.manage_pipelines && <LostReasons />}
      </div>
    </section>
  )
}

/** One signal: what it means, its figure, and the first few leads in it. */
function Signal({ icon: Icon, tone = 'neutral', title, line, figure, sample }: { icon: LucideIcon; tone?: Tone; title: string; line: string; figure: string; sample: SignalLead[] }) {
  const { t } = useTranslation()
  const records = useRecords()
  return (
    <li className="px-4 py-2.5">
      <div className="flex items-center gap-3">
        <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE_CHIP[tone]}`}><Icon size={15} /></span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-a-text">{title}</span>
          <InfoTip text={line} />
        </span>
        <span className="shrink-0 font-a-display text-xl text-a-text">{figure}</span>
      </div>
      {sample.length > 0 && (
        <ul className="mt-1.5 flex flex-wrap gap-1.5 pl-11">
          {sample.slice(0, 3).map(lead => (
            <li key={lead.id}>
              <Link to={records.href('lead', lead.id)} className="inline-flex max-w-[14rem] truncate rounded-full border border-a-border px-2.5 py-1 text-xs text-a-text hover:border-a-accent/50">
                {signalName(lead) ?? t('crm.insights.lead_number', 'Lead #{{id}}', { id: lead.id })}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

/** Why leads were lost (managers: GET inquiry-lost-reasons-admin, every reason with its leads, all time). */
function LostReasons() {
  const { t, i18n } = useTranslation()
  const reasons = useQuery({ queryKey: [...INSIGHTS, 'lost-reasons'], queryFn: () => get<LostReasonCount[]>('inquiry-lost-reasons-admin'), staleTime: 5 * 60_000 })
  const rows = lostReasonRows(Array.isArray(reasons.data) ? reasons.data : [])
  return (
    <Card title={t('crm.insights.lost_reasons', 'Why leads were lost')} icon={XCircle} tone="danger" description={t('crm.insights.lost_desc', 'All time, by the reason chosen')}>
      <QueryState loading={reasons.isLoading} error={reasons.error} onRetry={() => { void reasons.refetch() }} rows={3}>
        {rows.length === 0
          ? <p className="text-sm text-a-text-2">{t('crm.insights.no_lost', 'No lead has been marked lost with a reason yet.')}</p>
          : (
            <>
              <BarList label={t('crm.insights.lost_reasons', 'Why leads were lost')}
                rows={rows.map(r => ({ id: String(r.id), label: r.label, value: r.count, text: countOf(r.count, i18n.language), tone: 'lost' }))} />
            </>
          )}
      </QueryState>
    </Card>
  )
}
