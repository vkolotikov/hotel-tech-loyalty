import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, CalendarClock, Coins, Columns3, Sparkles, Target, Trophy, UserPlus, XCircle } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, dayLabel, money } from '../lib/format'
import { leadPath } from '../lib/links'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Select } from '../ui/inputs'
import { InlineSelect } from '../leads/InlineSelect'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { useLeadChanged, usePipelines } from '../leads/leadData'
import { amount, defaultPipeline, followUp, sortedStages, stageColor, winTone } from '../leads/leadLogic'
import { LostDialog, WonDialog } from '../leads/LeadClose'
import type { LeadKpis, LeadRow, Paginated, Pipeline, Stage } from '../leads/leadTypes'
import { BOARD_LIMIT, boardColumns, boardQuery, moveCard, moveTargets, openTotals, phoneColumn, pickPipeline, withMoved, type Column } from './board'
import { WonDeals } from './WonDeals'

const read = (sp: URLSearchParams, key: string): string => sp.get(key) ?? ''

/**
 * Pipeline (2026-11-07): the open leads as a board, one column per stage of the chosen pipeline with its count and
 * value; a card moves with its "Move to" choices (or dragged, on a large screen), won and lost through their own flows.
 * And the won deals, walked through fulfilment and payment (the full admin's Deals). The phone shows one stage at a time.
 */
export function PipelinePage() {
  const { t } = useTranslation()
  const [sp, setSp] = useSearchParams()
  const tab = read(sp, 'tab') === 'won' ? 'won' : 'board'
  const setTab = (next: 'board' | 'won') => {
    const q = new URLSearchParams(sp)
    if (next === 'board') q.delete('tab'); else q.set('tab', next)
    setSp(q, { replace: true })
  }
  return (
    <Page wide title={t('crm.nav.pipeline', 'Pipeline')} line={t('crm.pipeline.line', 'Open leads by stage. Move a card when the lead moves on.')}
      actions={<Link to="/crm/leads?new=1" className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep"><UserPlus size={15} aria-hidden />{t('crm.pipeline.add_lead', 'Add a lead')}</Link>}>
      <Tabs label={t('crm.pipeline.view', 'View')} value={tab} onChange={setTab}
        items={[{ key: 'board', label: t('crm.pipeline.tab_board', 'Board') }, { key: 'won', label: t('crm.pipeline.tab_won', 'Won deals') }]} />
      {tab === 'board' ? <BoardTab /> : <WonDeals />}
    </Page>
  )
}

function BoardTab() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const qc = useQueryClient()
  const toast = useToast()
  const changed = useLeadChanged()
  const [sp, setSp] = useSearchParams()
  const pipelines = usePipelines()
  const pipeline = pickPipeline(pipelines.data, Number(read(sp, 'p')) || null)
  const isDefault = pipeline !== null && defaultPipeline(pipelines.data)?.id === pipeline.id
  const query = boardQuery()
  const boardKey = ['crm', 'pipeline', 'board', query] as const
  const leads = useQuery({ queryKey: boardKey, queryFn: () => get<Paginated<LeadRow>>(`inquiries${params(query)}`) })
  const kpis = useQuery({ queryKey: ['crm', 'pipeline', 'kpis'], queryFn: () => get<LeadKpis>('inquiries/kpis'), staleTime: 60_000 })
  const [closing, setClosing] = useState<{ kind: 'won' | 'lost'; lead: LeadRow } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [phoneStage, setPhoneStage] = useState<number | null>(null)

  const move = useMutation({
    mutationFn: ({ lead, status }: { lead: LeadRow; status: string }) => send('put', `inquiries/${lead.id}`, { status }),
    onMutate: async ({ lead, status }) => {
      await qc.cancelQueries({ queryKey: boardKey })
      const before = qc.getQueryData<Paginated<LeadRow>>(boardKey)
      qc.setQueryData(boardKey, withMoved(before, lead.id, status))
      return { before }
    },
    onError: (e, _v, context) => { if (context?.before) qc.setQueryData(boardKey, context.before); toast(errorText(t, e), 'danger') },
    onSuccess: (_r, { status }) => toast(t('crm.pipeline.moved', 'Moved to {{stage}}', { stage: status })),
    onSettled: () => changed(),
  })

  const stages = sortedStages(pipeline?.stages)
  const columns = pipeline ? boardColumns(pipeline, leads.data?.data ?? [], isDefault) : []
  const totals = openTotals(columns)
  const drop = (lead: LeadRow, target: Stage) => {
    const action = moveCard(lead, target, stages)
    if (action.kind === 'won' || action.kind === 'lost') setClosing({ kind: action.kind, lead })
    else if (action.kind === 'stage') move.mutate({ lead, status: action.status })
  }
  const byId = (id: number | null) => (leads.data?.data ?? []).find(l => l.id === id) ?? null
  const phone = phoneColumn(columns, phoneStage)
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')

  return (
    <div className="space-y-5">
      {kpis.data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile icon={Target} tone="accent" label={t('crm.pipeline.kpi_open', 'Open leads')} value={count(kpis.data.total, lang)} to="/crm/leads" />
          <StatTile icon={Coins} tone="success" label={t('crm.pipeline.kpi_value', 'Estimated value')} value={money(kpis.data.estimated_value, boot.venue.currency, lang)} />
          <StatTile icon={CalendarClock} tone={kpis.data.overdue > 0 ? 'danger' : 'pending'} label={t('crm.pipeline.kpi_due', 'Follow-ups due')}
            value={count(kpis.data.due_today + kpis.data.overdue, lang)} hint={t('crm.pipeline.kpi_overdue', '{{count}} overdue', { count: kpis.data.overdue })} to="/crm/leads?due=1" />
          <StatTile icon={Sparkles} tone="progress" label={t('crm.pipeline.kpi_new', 'New this week')} value={count(kpis.data.new_this_week, lang)} />
        </div>
      )}

      <QueryState loading={pipelines.isLoading || leads.isLoading} error={pipelines.error ?? leads.error} onRetry={() => { void pipelines.refetch(); void leads.refetch() }}>
        {!pipeline ? (
          <Card><EmptyState icon={Columns3} title={t('crm.pipeline.no_pipeline', 'No pipeline yet')} line={t('crm.pipeline.no_pipeline_line', 'A manager sets up the stages a lead goes through under Settings.')} /></Card>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {(pipelines.data?.length ?? 0) > 1 && (
                <label className="flex items-center gap-2 text-sm text-a-text-2">
                  {t('crm.pipeline.which', 'Pipeline')}
                  <InlineSelect value={pipeline.id} onChange={e => { const q = new URLSearchParams(sp); q.set('p', e.target.value); setSp(q, { replace: true }); setPhoneStage(null) }}>
                    {(pipelines.data ?? []).map((p: Pipeline) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </InlineSelect>
                </label>
              )}
              <p className="text-sm text-a-text-2">{t('crm.pipeline.totals', '{{count}} open leads worth {{value}}', { count: totals.count, value: money(totals.value, boot.venue.currency, lang) })}</p>
            </div>
            {(leads.data?.total ?? 0) > BOARD_LIMIT && (
              <Notice tone="info">{t('crm.pipeline.truncated', 'The board shows the {{count}} most recently changed leads. Find the others in Leads.', { count: BOARD_LIMIT })}</Notice>
            )}

            {/* A large screen: every stage side by side, the board scrolling sideways inside its own frame. */}
            <div className="crm-board hidden overflow-x-auto pb-2 md:block">
              <div className="flex min-w-max items-start gap-3">
                {columns.map(column => (
                  <section key={column.stage.id} aria-label={column.stage.name}
                    onDragOver={e => { if (dragging !== null) e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); const lead = byId(dragging); setDragging(null); if (lead) drop(lead, column.stage) }}
                    className={`flex shrink-0 flex-col rounded-2xl border bg-a-surface-2/60 ${column.collapsed ? 'w-52' : 'w-72'} ${dragging !== null ? 'border-a-accent/40' : 'border-a-border'}`}>
                    <ColumnHead column={column} lang={lang} />
                    <div className="space-y-2 p-2">
                      {column.collapsed ? (
                        <ClosedHint column={column} dragging={dragging !== null} />
                      ) : column.leads.length === 0 ? (
                        <p className="px-2 py-6 text-center text-xs text-a-text-2">{dragging !== null ? t('crm.pipeline.drop_here', 'Drop here') : t('crm.pipeline.column_empty', 'No leads at this stage')}</p>
                      ) : column.leads.map(lead => (
                        <LeadCard key={lead.id} lead={lead} name={name(lead)} stages={stages} lang={lang}
                          draggable onDragStart={() => setDragging(lead.id)} onDragEnd={() => setDragging(null)}
                          onMove={target => drop(lead, target)} busy={move.isPending && move.variables?.lead.id === lead.id} />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            {/* A phone: one stage at a time. */}
            <div className="space-y-3 md:hidden">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.pipeline.stage', 'Stage')}</span>
                <Select value={phone?.stage.id ?? ''} onChange={e => setPhoneStage(Number(e.target.value))}>
                  {columns.map(c => <option key={c.stage.id} value={c.stage.id}>{`${c.stage.name} (${c.count})`}</option>)}
                </Select>
              </label>
              {phone && (
                <section aria-label={phone.stage.name} className="rounded-2xl border border-a-border bg-a-surface-2/60">
                  <ColumnHead column={phone} lang={lang} />
                  <div className="space-y-2 p-2">
                    {phone.collapsed ? <ClosedHint column={phone} dragging={false} /> : phone.leads.length === 0
                      ? <p className="px-2 py-6 text-center text-xs text-a-text-2">{t('crm.pipeline.column_empty', 'No leads at this stage')}</p>
                      : phone.leads.map(lead => (
                        <LeadCard key={lead.id} lead={lead} name={name(lead)} stages={stages} lang={lang}
                          onMove={target => drop(lead, target)} busy={move.isPending && move.variables?.lead.id === lead.id} />
                      ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        )}
      </QueryState>

      {closing?.kind === 'won' && <WonDialog leadId={closing.lead.id} name={name(closing.lead)} onClose={() => setClosing(null)} />}
      {closing?.kind === 'lost' && <LostDialog leadId={closing.lead.id} name={name(closing.lead)} onClose={() => setClosing(null)} />}
    </div>
  )
}

function ColumnHead({ column, lang }: { column: Column; lang: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const dot = stageColor(column.stage.color)
  return (
    <header className="flex items-start gap-2 border-b border-a-border px-3 py-2.5">
      {dot ? <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} />
        : column.stage.kind === 'won' ? <Trophy size={14} aria-hidden className="mt-0.5 shrink-0 text-a-st-confirmed" />
        : column.stage.kind === 'lost' ? <XCircle size={14} aria-hidden className="mt-0.5 shrink-0 text-a-danger" /> : null}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-a-text">{column.stage.name}</h3>
        {!column.collapsed && <p className="text-xs text-a-text-2">{money(column.value, boot.venue.currency, lang)}</p>}
      </div>
      <span className="rounded-full bg-a-surface px-2 text-xs font-medium leading-5 text-a-text" aria-label={t('crm.pipeline.count', '{{count}} leads', { count: column.count })}>{column.count}</span>
    </header>
  )
}

function ClosedHint({ column, dragging }: { column: Column; dragging: boolean }) {
  const { t } = useTranslation()
  const won = column.stage.kind === 'won'
  return (
    <div className="space-y-2 px-2 py-4 text-center text-xs text-a-text-2">
      <p>{dragging
        ? (won ? t('crm.pipeline.drop_won', 'Drop to mark it won') : t('crm.pipeline.drop_lost', 'Drop to mark it lost'))
        : (won ? t('crm.pipeline.won_hint', 'Won leads become deals.') : t('crm.pipeline.lost_hint', 'Lost leads stay in Contacts.'))}</p>
      {won && !dragging && <Link to="/crm/pipeline?tab=won" className="font-medium text-a-accent-text hover:underline">{t('crm.pipeline.see_won', 'See won deals')}</Link>}
    </div>
  )
}

/** A lead on the board: who, the value, the follow-up, the owner, the AI's chance, and where it can move. */
function LeadCard({ lead, name, stages, lang, onMove, busy, draggable = false, onDragStart, onDragEnd }: {
  lead: LeadRow
  name: string
  stages: Stage[]
  lang: string
  onMove: (target: Stage) => void
  busy: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const [moving, setMoving] = useState(false)
  const value = amount(lead.total_value)
  const next = followUp(lead, boot.venue.today)
  const tone = winTone(lead.ai_win_probability)
  const targets = moveTargets(lead, stages)
  return (
    <article draggable={draggable} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(lead.id)); onDragStart?.() }} onDragEnd={onDragEnd}
      className={`rounded-xl border border-a-border bg-a-surface p-3 shadow-a-sm ${busy ? 'opacity-60' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <Link to={leadPath(lead.id)} draggable={false} className="block truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
          {lead.guest?.company && <p className="truncate text-xs text-a-text-2">{lead.guest.company}</p>}
        </div>
        {typeof lead.ai_win_probability === 'number' && tone && <Pill tone={tone} title={t('crm.pipeline.ai_chance', 'The AI\'s chance to win')}>{`${lead.ai_win_probability} %`}</Pill>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-a-text-2">
        {value !== null && <span className="font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>}
        {next?.day && (
          <span className={next.state === 'overdue' ? 'font-medium text-a-danger' : next.state === 'today' ? 'font-medium text-a-st-pending' : ''}>
            {next.state === 'today' ? t('crm.pipeline.follow_today', 'Follow up today') : dayLabel(next.day, lang)}
          </span>
        )}
        {lead.assigned_to && <span className="truncate">{lead.assigned_to}</span>}
      </div>
      {targets.length > 0 && (
        <div className="mt-2">
          <button type="button" aria-expanded={moving} onClick={() => setMoving(m => !m)} disabled={busy}
            className="inline-flex min-h-8 items-center gap-1 rounded-full border border-a-border px-2.5 text-xs font-medium text-a-text-2 hover:text-a-text disabled:opacity-50">
            <ArrowRightLeft size={13} aria-hidden />{t('crm.pipeline.move_to', 'Move to')}
          </button>
          {moving && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('crm.pipeline.move_named', 'Move {{name}} to', { name })}>
              {targets.map(target => (
                <li key={target.id}>
                  <Button size="sm" variant={target.kind === 'lost' ? 'danger' : target.kind === 'won' ? 'primary' : 'secondary'}
                    onClick={() => { setMoving(false); onMove(target) }}>
                    {target.name}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  )
}
