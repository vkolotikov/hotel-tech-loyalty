import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, ArrowRightLeft, CalendarClock, Coins, Columns3, Info, Target, Trophy, UserRoundCheck, Users, XCircle } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { count as countText, dayLabel, money } from '../lib/format'
import { useRecordList, useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { InfoTip } from '../ui/InfoTip'
import { ActionMenu } from '../ui/Menu'
import { EmptyState } from '../ui/EmptyState'
import { Select } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { BOARD_LIMIT, boardColumns, boardQuery, moveCard, moveTargets, openTotals, phoneColumn, pickPipeline, withMoved, type Column } from './board'
import { InlineSelect } from './InlineSelect'
import { LostDialog, WonDialog } from './LeadClose'
import { useLeadChanged, useLeadSettings, usePipelines } from './leadData'
import { amount, defaultPipeline, followUp, ownerOptions, resolveStage, sortedStages, stageColor, type LeadFilters } from './leadLogic'
import { priorityTone } from './listLogic'
import { ownerColumns, phoneOwner, withOwner, type OwnerColumn } from './listLogic'
import { AiCell, FreshChip, StagePill } from './parts'
import { boardOrder, rowOpens } from './recordLogic'
import type { LeadRow, Paginated, Pipeline, Stage } from './leadTypes'

const read = (sp: URLSearchParams, key: string): string => sp.get(key) ?? ''

/** The open leads the board and the team draw (`GET inquiries`, the list's filters, most recently changed first). */
function useBoardLeads(filters: LeadFilters) {
  const boot = useBoot()
  const query = boardQuery(filters, boot.staff.name)
  const key = ['crm', 'leads', 'board', query] as const
  return { key, leads: useQuery({ queryKey: key, queryFn: () => get<Paginated<LeadRow>>(`inquiries${params(query)}`) }) }
}

/**
 * The board (round 1's Pipeline, round 2's Leads → Board; round 5: compact cards that open their lead's panel): one
 * column per stage of the chosen pipeline (`?p=`) with its count and value; a card moves with its "Move to" menu (or
 * dragged, on a large screen), won and lost through their own flows. The phone shows one stage at a time; the board
 * scrolls sideways inside its own frame.
 */
export function LeadsBoard({ filters, now }: { filters: LeadFilters; now: Date }) {
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
  const { key, leads } = useBoardLeads(filters)
  const [closing, setClosing] = useState<{ kind: 'won' | 'lost'; lead: LeadRow } | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [phoneStage, setPhoneStage] = useState<number | null>(null)

  const move = useMutation({
    mutationFn: ({ lead, status }: { lead: LeadRow; status: string }) => send('put', `inquiries/${lead.id}`, { status }),
    onMutate: async ({ lead, status }) => {
      await qc.cancelQueries({ queryKey: key })
      const before = qc.getQueryData<Paginated<LeadRow>>(key)
      qc.setQueryData(key, withMoved(before, lead.id, status))
      return { before }
    },
    onError: (e, _v, context) => { if (context?.before) qc.setQueryData(key, context.before); toast(errorText(t, e), 'danger') },
    onSuccess: (_r, { status }) => toast(t('crm.pipeline.moved', 'Moved to {{stage}}', { stage: status })),
    onSettled: () => changed(),
  })

  const stages = sortedStages(pipeline?.stages)
  const columns = pipeline ? boardColumns(pipeline, leads.data?.data ?? [], isDefault) : []
  const totals = openTotals(columns)
  // The panel's previous and next walk the board column by column.
  useRecordList('lead', boardOrder(columns))
  const drop = (lead: LeadRow, target: Stage) => {
    const action = moveCard(lead, target, stages)
    if (action.kind === 'won' || action.kind === 'lost') setClosing({ kind: action.kind, lead })
    else if (action.kind === 'stage') move.mutate({ lead, status: action.status })
  }
  const byId = (id: number | null) => (leads.data?.data ?? []).find(l => l.id === id) ?? null
  const phone = phoneColumn(columns, phoneStage)
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const card = (lead: LeadRow, draggable: boolean) => (
    <LeadCard key={lead.id} lead={lead} name={name(lead)} lang={lang} now={now} busy={move.isPending && move.variables?.lead.id === lead.id}
      draggable={draggable} onDragStart={() => setDragging(lead.id)} onDragEnd={() => setDragging(null)}
      action={<MoveTo lead={lead} name={name(lead)} stages={stages} onMove={target => drop(lead, target)} busy={move.isPending && move.variables?.lead.id === lead.id} />} />
  )

  return (
    <div className="space-y-3">
      <QueryState loading={pipelines.isLoading || leads.isLoading} error={pipelines.error ?? leads.error} onRetry={() => { void pipelines.refetch(); void leads.refetch() }}>
        {!pipeline ? (
          <Card><EmptyState icon={Columns3} title={t('crm.pipeline.no_pipeline', 'No pipeline yet')} line={t('crm.pipeline.no_pipeline_line', 'A manager sets up the stages a lead goes through under Settings.')} /></Card>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {(pipelines.data?.length ?? 0) > 1 && (
                <label className="flex items-center">
                  <span className="sr-only">{t('crm.pipeline.which', 'Pipeline')}</span>
                  <InlineSelect value={pipeline.id} onChange={e => { const q = new URLSearchParams(sp); q.set('p', e.target.value); setSp(q, { replace: true }); setPhoneStage(null) }}>
                    {(pipelines.data ?? []).map((p: Pipeline) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </InlineSelect>
                </label>
              )}
              <Totals count={totals.count} value={money(totals.value, boot.venue.currency, lang)} lang={lang} />
              {(leads.data?.total ?? 0) > BOARD_LIMIT && <Truncated />}
            </div>

            <div className="crm-board hidden overflow-x-auto pb-2 md:block">
              <div className="flex min-w-max items-start gap-3">
                {columns.map(column => (
                  <section key={column.stage.id} aria-label={column.stage.name}
                    onDragOver={e => { if (dragging !== null) e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); const lead = byId(dragging); setDragging(null); if (lead) drop(lead, column.stage) }}
                    className={`flex shrink-0 flex-col rounded-2xl border bg-a-surface-2/60 ${column.collapsed ? 'w-44' : 'w-72'} ${dragging !== null ? 'border-a-accent/40' : 'border-a-border'}`}>
                    <ColumnHead column={column} lang={lang} />
                    <div className="space-y-2 p-2">
                      {column.collapsed ? <ClosedHint column={column} dragging={dragging !== null} />
                        : column.leads.length === 0 ? <p className="px-2 py-6 text-center text-xs text-a-text-2">{dragging !== null ? t('crm.pipeline.drop_here', 'Drop here') : t('crm.pipeline.column_empty_short', 'None')}</p>
                        : column.leads.map(lead => card(lead, true))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

            <div className="space-y-3 md:hidden">
              <label className="block">
                <span className="sr-only">{t('crm.pipeline.stage', 'Stage')}</span>
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
                      : phone.leads.map(lead => card(lead, false))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </QueryState>
      {closing?.kind === 'won' && <WonDialog leadId={closing.lead.id} name={name(closing.lead)} onClose={() => setClosing(null)} />}
      {closing?.kind === 'lost' && <LostDialog leadId={closing.lead.id} name={name(closing.lead)} onClose={() => setClosing(null)} />}
    </div>
  )
}

/** The board's open part in two figures: how many leads, what they are worth (said in full to a screen reader). */
function Totals({ count, value, lang }: { count: number; value: string; lang: string }) {
  const { t } = useTranslation()
  const said = t('crm.pipeline.totals', '{{count}} open leads worth {{value}}', { count, value })
  return (
    <p className="flex items-center gap-3 text-sm text-a-text" title={said}>
      <span className="sr-only">{said}</span>
      <span aria-hidden className="inline-flex items-center gap-1.5"><Target size={14} className="text-a-text-2" />{countText(count, lang)}</span>
      <span aria-hidden className="inline-flex items-center gap-1.5"><Coins size={14} className="text-a-text-2" />{value}</span>
    </p>
  )
}

/** The board draws at most BOARD_LIMIT leads: said in a line, the rest are in the list. */
function Truncated() {
  const { t } = useTranslation()
  return (
    <p className="flex items-center gap-1.5 text-xs text-a-text-2">
      <Info size={13} aria-hidden />{t('crm.pipeline.truncated', 'The board shows the {{count}} most recently changed leads. Find the others in Leads.', { count: BOARD_LIMIT })}
    </p>
  )
}

/**
 * Team (round 2, as the main platform's team buckets): the open leads by who owns them — nobody first, then each owner
 * the organisation names — with each column's count and value. A card is given to someone with "Give to" (or dragged,
 * on a large screen), `PUT inquiries/{id}` with the owner's name.
 */
export function LeadsTeam({ filters, now }: { filters: LeadFilters; now: Date }) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const qc = useQueryClient()
  const toast = useToast()
  const changed = useLeadChanged()
  const settings = useLeadSettings()
  const team = useTeam()
  const pipelines = usePipelines()
  const stages = sortedStages(defaultPipeline(pipelines.data)?.stages)
  const { key, leads } = useBoardLeads(filters)
  const [dragging, setDragging] = useState<number | null>(null)
  const [phoneWho, setPhoneWho] = useState<string | null | undefined>(undefined)
  const owners = ownerOptions(boot.staff.name, settings.owners, team.data ?? [])
  const columns = ownerColumns(leads.data?.data ?? [], owners)
  useRecordList('lead', columns.flatMap(column => column.leads.map(lead => lead.id)))

  const give = useMutation({
    mutationFn: ({ lead, owner }: { lead: LeadRow; owner: string | null }) => send('put', `inquiries/${lead.id}`, { assigned_to: owner }),
    onMutate: async ({ lead, owner }) => {
      await qc.cancelQueries({ queryKey: key })
      const before = qc.getQueryData<Paginated<LeadRow>>(key)
      qc.setQueryData(key, withOwner(before, lead.id, owner))
      return { before }
    },
    onError: (e, _v, context) => { if (context?.before) qc.setQueryData(key, context.before); toast(errorText(t, e), 'danger') },
    onSuccess: (_r, { owner }) => toast(owner ? t('crm.pipeline.given', 'Given to {{name}}', { name: owner }) : t('crm.pipeline.given_nobody', 'Nobody owns it now')),
    onSettled: () => changed(),
  })
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const byId = (id: number | null) => (leads.data?.data ?? []).find(l => l.id === id) ?? null
  const dropOn = (owner: string | null) => {
    const lead = byId(dragging)
    setDragging(null)
    if (lead && (lead.assigned_to ?? '').toLowerCase() !== (owner ?? '').toLowerCase()) give.mutate({ lead, owner })
  }
  const phone = phoneOwner(columns, phoneWho)
  const ownerName = (owner: string | null) => owner === null ? t('crm.leads.owner_none', 'Nobody yet') : owner === boot.staff.name ? t('crm.leads.owner_me', 'Me ({{name}})', { name: owner }) : owner
  const card = (lead: LeadRow, draggable: boolean) => (
    <LeadCard key={lead.id} lead={lead} name={name(lead)} lang={lang} now={now} stage={resolveStage(lead, stages)} busy={give.isPending && give.variables?.lead.id === lead.id}
      draggable={draggable} onDragStart={() => setDragging(lead.id)} onDragEnd={() => setDragging(null)}
      action={<GiveTo lead={lead} name={name(lead)} owners={columns.map(c => c.owner)} label={ownerName} onGive={owner => give.mutate({ lead, owner })} busy={give.isPending} />} />
  )
  const head = (column: OwnerColumn) => (
    <header className="flex items-center gap-2 border-b border-a-border px-3 py-2">
      {column.owner === null
        ? <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-a-st-pending/12 text-a-st-pending"><Users size={14} /></span>
        : <Avatar name={column.owner} size="sm" />}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-a-text">{ownerName(column.owner)}</h3>
        <p className="text-xs text-a-text-2">{money(column.value, boot.venue.currency, lang)}</p>
      </div>
      <span className="rounded-full bg-a-surface px-2 text-xs font-medium leading-5 text-a-text" aria-label={t('crm.pipeline.count', '{{count}} leads', { count: column.count })}>{column.count}</span>
    </header>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-sm text-a-text"><UserRoundCheck size={14} aria-hidden className="text-a-text-2" />{t('crm.pipeline.team_short', 'By owner')}</p>
        <InfoTip text={t('crm.pipeline.team_line', 'Who owns each open lead. Give a lead to someone to make it theirs.')} />
        {(leads.data?.total ?? 0) > BOARD_LIMIT && <Truncated />}
      </div>
      <QueryState loading={leads.isLoading} error={leads.error} onRetry={() => { void leads.refetch() }}>
        <div className="crm-board hidden overflow-x-auto pb-2 md:block">
          <div className="flex min-w-max items-start gap-3">
            {columns.map(column => (
              <section key={column.owner ?? ''} aria-label={ownerName(column.owner)}
                onDragOver={e => { if (dragging !== null) e.preventDefault() }}
                onDrop={e => { e.preventDefault(); dropOn(column.owner) }}
                className={`flex w-72 shrink-0 flex-col rounded-2xl border bg-a-surface-2/60 ${dragging !== null ? 'border-a-accent/40' : column.owner === null && column.count > 0 ? 'border-a-st-pending/40' : 'border-a-border'}`}>
                {head(column)}
                <div className="space-y-2 p-2">
                  {column.leads.length === 0
                    ? <p className="px-2 py-6 text-center text-xs text-a-text-2">{dragging !== null ? t('crm.pipeline.drop_here', 'Drop here') : t('crm.pipeline.column_empty_short', 'None')}</p>
                    : column.leads.map(lead => card(lead, true))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="space-y-3 md:hidden">
          <label className="block">
            <span className="sr-only">{t('crm.pipeline.team_who', 'Whose leads')}</span>
            <Select value={phone?.owner ?? ''} onChange={e => setPhoneWho(e.target.value || null)}>
              {columns.map(c => <option key={c.owner ?? ''} value={c.owner ?? ''}>{`${ownerName(c.owner)} (${c.count})`}</option>)}
            </Select>
          </label>
          {phone && (
            <section aria-label={ownerName(phone.owner)} className="rounded-2xl border border-a-border bg-a-surface-2/60">
              {head(phone)}
              <div className="space-y-2 p-2">
                {phone.leads.length === 0 ? <p className="px-2 py-6 text-center text-xs text-a-text-2">{t('crm.pipeline.team_empty', 'No open leads')}</p> : phone.leads.map(lead => card(lead, false))}
              </div>
            </section>
          )}
        </div>
      </QueryState>
    </div>
  )
}

function ColumnHead({ column, lang }: { column: Column; lang: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const dot = stageColor(column.stage.color)
  return (
    <header className="flex items-center gap-2 border-b border-a-border px-3 py-2">
      {column.stage.kind === 'won' ? <Trophy size={14} aria-hidden className="shrink-0 text-a-st-confirmed" />
        : column.stage.kind === 'lost' ? <XCircle size={14} aria-hidden className="shrink-0 text-a-danger" />
        : dot ? <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: dot }} /> : null}
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
  if (dragging) return <p className="px-2 py-4 text-center text-xs text-a-text-2">{won ? t('crm.pipeline.drop_won', 'Drop to mark it won') : t('crm.pipeline.drop_lost', 'Drop to mark it lost')}</p>
  return (
    <div className="flex items-center justify-center gap-1 px-2 py-3 text-xs text-a-text-2">
      {won
        ? <Link to="/crm/deals" className="inline-flex items-center gap-1 font-medium text-a-accent-text hover:underline">{t('crm.pipeline.see_won', 'See won deals')}<ArrowRight size={12} aria-hidden /></Link>
        : <span>{t('crm.pipeline.lost_short', 'In Contacts')}</span>}
      <InfoTip align="right" text={won ? t('crm.pipeline.won_hint', 'Won leads become deals.') : t('crm.pipeline.lost_hint', 'Lost leads stay in Contacts.')} />
    </div>
  )
}

/**
 * A lead on the board or the team (round 5: compact, with icons): who, the AI's chance, a move; then how fresh, the
 * stage (on the team), the value, the follow-up, the priority and the owner (on the board). The name opens its panel,
 * and so does a press on the card's empty space.
 */
function LeadCard({ lead, name, lang, now, stage, action, busy, draggable = false, onDragStart, onDragEnd }: {
  lead: LeadRow
  name: string
  lang: string
  now: Date
  /** On the team: the stage the lead is in (the board shows its owner instead). */
  stage?: Stage | null
  action: ReactNode
  busy: boolean
  draggable?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  const settings = useLeadSettings()
  const value = amount(lead.total_value)
  const next = followUp(lead, boot.venue.today)
  const tone = priorityTone(lead.priority, settings.priorities)
  return (
    <article draggable={draggable} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(lead.id)); onDragStart?.() }} onDragEnd={onDragEnd}
      onClick={e => { if (rowOpens(e.target as Element | null, e.defaultPrevented)) records.open('lead', lead.id) }}
      className={`cursor-pointer rounded-xl border border-a-border bg-a-surface p-2.5 shadow-a-sm transition-colors hover:border-a-accent/40 ${busy ? 'opacity-60' : ''} ${draggable ? 'active:cursor-grabbing' : ''}`}>
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <Link to={records.href('lead', lead.id)} draggable={false} className="block truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
          {lead.guest?.company && <p className="truncate text-xs text-a-text-2">{lead.guest.company}</p>}
        </div>
        <span className="pt-0.5"><AiCell lead={lead} compact /></span>
        {action}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-a-text-2">
        <FreshChip lead={lead} now={now} />
        {stage !== undefined && <StagePill stage={stage} fallback={lead.status} />}
        {value !== null && <span className="inline-flex items-center gap-1 font-medium text-a-text"><Coins size={12} aria-hidden className="text-a-text-2" />{money(value, boot.venue.currency, lang)}</span>}
        {next?.day && (
          <span className={`inline-flex items-center gap-1 ${next.state === 'overdue' ? 'font-medium text-a-danger' : next.state === 'today' ? 'font-medium text-a-st-pending' : ''}`}>
            <CalendarClock size={12} aria-hidden />{next.state === 'today' ? t('crm.pipeline.follow_today_short', 'Today') : dayLabel(next.day, lang)}
          </span>
        )}
        {lead.priority && tone && stage === undefined && <Pill tone={tone}>{lead.priority}</Pill>}
        {stage === undefined && lead.assigned_to && <span className="ml-auto" title={lead.assigned_to}><Avatar name={lead.assigned_to} size="sm" /><span className="sr-only">{lead.assigned_to}</span></span>}
      </div>
    </article>
  )
}

const MOVE = 'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent'

/** "Move to": every other stage of the card's pipeline, in a menu. */
function MoveTo({ lead, name, stages, onMove, busy }: { lead: LeadRow; name: string; stages: Stage[]; onMove: (target: Stage) => void; busy: boolean }) {
  const { t } = useTranslation()
  const targets = moveTargets(lead, stages)
  if (targets.length === 0) return null
  const label = t('crm.pipeline.move_named', 'Move {{name}} to', { name })
  return (
    <span title={t('crm.pipeline.move_to', 'Move to')} className="inline-flex">
      <ActionMenu label={label} className={MOVE} button={<ArrowRightLeft size={14} aria-hidden />}
        items={[{ heading: t('crm.pipeline.move_to', 'Move to') }, ...targets.map(target => ({
          key: `s${target.id}`, label: target.name, disabled: busy, danger: target.kind === 'lost',
          icon: target.kind === 'won' ? Trophy : target.kind === 'lost' ? XCircle : ArrowRight, onSelect: () => onMove(target),
        }))]} />
    </span>
  )
}

/** "Give to": everyone else who can own a lead, and nobody, in a menu. */
function GiveTo({ lead, name, owners, label, onGive, busy }: { lead: LeadRow; name: string; owners: (string | null)[]; label: (owner: string | null) => string; onGive: (owner: string | null) => void; busy: boolean }) {
  const { t } = useTranslation()
  const now = (lead.assigned_to ?? '').trim().toLowerCase()
  const others = owners.filter(o => (o ?? '').toLowerCase() !== now)
  if (others.length === 0) return null
  return (
    <span title={t('crm.pipeline.give_to', 'Give to')} className="inline-flex">
      <ActionMenu label={t('crm.pipeline.give_named', 'Give {{name}} to', { name })} className={MOVE} button={<UserRoundCheck size={14} aria-hidden />}
        items={[{ heading: t('crm.pipeline.give_to', 'Give to') }, ...others.map(owner => ({
          key: owner ?? '_nobody', label: label(owner), disabled: busy, icon: owner === null ? Users : UserRoundCheck, onSelect: () => onGive(owner),
        }))]} />
    </span>
  )
}
