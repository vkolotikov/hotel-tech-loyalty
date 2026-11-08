import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRightLeft, Columns3, Trophy, UserRoundCheck, Users, XCircle } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, money } from '../lib/format'
import { leadPath } from '../lib/links'
import { Card } from '../ui/Card'
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
import { ownerColumns, phoneOwner, withOwner, type OwnerColumn } from './listLogic'
import { AiCell, FreshChip, StagePill } from './parts'
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
 * The board (round 1's Pipeline, round 2's Leads → Board): one column per stage of the chosen pipeline (`?p=`) with its
 * count and value; a card moves with its "Move to" choices (or dragged, on a large screen), won and lost through their
 * own flows. The phone shows one stage at a time; the board scrolls sideways inside its own frame.
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

            <div className="crm-board hidden overflow-x-auto pb-2 md:block">
              <div className="flex min-w-max items-start gap-3">
                {columns.map(column => (
                  <section key={column.stage.id} aria-label={column.stage.name}
                    onDragOver={e => { if (dragging !== null) e.preventDefault() }}
                    onDrop={e => { e.preventDefault(); const lead = byId(dragging); setDragging(null); if (lead) drop(lead, column.stage) }}
                    className={`flex shrink-0 flex-col rounded-2xl border bg-a-surface-2/60 ${column.collapsed ? 'w-52' : 'w-72'} ${dragging !== null ? 'border-a-accent/40' : 'border-a-border'}`}>
                    <ColumnHead column={column} lang={lang} />
                    <div className="space-y-2 p-2">
                      {column.collapsed ? <ClosedHint column={column} dragging={dragging !== null} />
                        : column.leads.length === 0 ? <p className="px-2 py-6 text-center text-xs text-a-text-2">{dragging !== null ? t('crm.pipeline.drop_here', 'Drop here') : t('crm.pipeline.column_empty', 'No leads at this stage')}</p>
                        : column.leads.map(lead => card(lead, true))}
                    </div>
                  </section>
                ))}
              </div>
            </div>

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
    <header className="flex items-start gap-2 border-b border-a-border px-3 py-2.5">
      {column.owner === null ? <Users size={15} aria-hidden className="mt-0.5 shrink-0 text-a-st-pending" /> : <UserRoundCheck size={15} aria-hidden className="mt-0.5 shrink-0 text-a-text-2" />}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-semibold text-a-text">{ownerName(column.owner)}</h3>
        <p className="text-xs text-a-text-2">{money(column.value, boot.venue.currency, lang)}</p>
      </div>
      <span className="rounded-full bg-a-surface px-2 text-xs font-medium leading-5 text-a-text" aria-label={t('crm.pipeline.count', '{{count}} leads', { count: column.count })}>{column.count}</span>
    </header>
  )

  return (
    <div className="space-y-3">
      <p className="text-sm text-a-text-2">{t('crm.pipeline.team_line', 'Who owns each open lead. Give a lead to someone to make it theirs.')}</p>
      {(leads.data?.total ?? 0) > BOARD_LIMIT && (
        <Notice tone="info">{t('crm.pipeline.truncated', 'The board shows the {{count}} most recently changed leads. Find the others in Leads.', { count: BOARD_LIMIT })}</Notice>
      )}
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
                    ? <p className="px-2 py-6 text-center text-xs text-a-text-2">{dragging !== null ? t('crm.pipeline.drop_here', 'Drop here') : t('crm.pipeline.team_empty', 'No open leads')}</p>
                    : column.leads.map(lead => card(lead, true))}
                </div>
              </section>
            ))}
          </div>
        </div>
        <div className="space-y-3 md:hidden">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.pipeline.team_who', 'Whose leads')}</span>
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
      {won && !dragging && <Link to="/crm/deals" className="font-medium text-a-accent-text hover:underline">{t('crm.pipeline.see_won', 'See won deals')}</Link>}
    </div>
  )
}

/** A lead on the board or the team: who, how fresh, the value, the follow-up, the owner or the stage, the AI's chance. */
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
  const value = amount(lead.total_value)
  const next = followUp(lead, boot.venue.today)
  return (
    <article draggable={draggable} onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(lead.id)); onDragStart?.() }} onDragEnd={onDragEnd}
      className={`rounded-xl border border-a-border bg-a-surface p-3 shadow-a-sm ${busy ? 'opacity-60' : ''} ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Link to={leadPath(lead.id)} draggable={false} className="truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
            <FreshChip lead={lead} now={now} />
          </div>
          {lead.guest?.company && <p className="truncate text-xs text-a-text-2">{lead.guest.company}</p>}
        </div>
        <AiCell lead={lead} compact />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-a-text-2">
        {stage !== undefined && <StagePill stage={stage} fallback={lead.status} />}
        {value !== null && <span className="font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>}
        {next?.day && (
          <span className={next.state === 'overdue' ? 'font-medium text-a-danger' : next.state === 'today' ? 'font-medium text-a-st-pending' : ''}>
            {next.state === 'today' ? t('crm.pipeline.follow_today', 'Follow up today') : dayLabel(next.day, lang)}
          </span>
        )}
        {stage === undefined && lead.assigned_to && <span className="truncate">{lead.assigned_to}</span>}
        {lead.priority && stage === undefined && <Pill>{lead.priority}</Pill>}
      </div>
      <div className="mt-2">{action}</div>
    </article>
  )
}

/** "Move to": every other stage of the card's pipeline, one press each. */
function MoveTo({ lead, name, stages, onMove, busy }: { lead: LeadRow; name: string; stages: Stage[]; onMove: (target: Stage) => void; busy: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const targets = moveTargets(lead, stages)
  if (targets.length === 0) return null
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(m => !m)} disabled={busy}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-a-border px-2.5 text-xs font-medium text-a-text-2 hover:text-a-text disabled:opacity-50">
        <ArrowRightLeft size={13} aria-hidden />{t('crm.pipeline.move_to', 'Move to')}
      </button>
      {open && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('crm.pipeline.move_named', 'Move {{name}} to', { name })}>
          {targets.map(target => (
            <li key={target.id}>
              <Button size="sm" variant={target.kind === 'lost' ? 'danger' : target.kind === 'won' ? 'primary' : 'secondary'} onClick={() => { setOpen(false); onMove(target) }}>
                {target.name}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** "Give to": everyone else who can own a lead, and nobody. */
function GiveTo({ lead, name, owners, label, onGive, busy }: { lead: LeadRow; name: string; owners: (string | null)[]; label: (owner: string | null) => string; onGive: (owner: string | null) => void; busy: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const now = (lead.assigned_to ?? '').trim().toLowerCase()
  const others = owners.filter(o => (o ?? '').toLowerCase() !== now)
  return (
    <>
      <button type="button" aria-expanded={open} onClick={() => setOpen(m => !m)} disabled={busy}
        className="inline-flex min-h-8 items-center gap-1 rounded-full border border-a-border px-2.5 text-xs font-medium text-a-text-2 hover:text-a-text disabled:opacity-50">
        <UserRoundCheck size={13} aria-hidden />{t('crm.pipeline.give_to', 'Give to')}
      </button>
      {open && (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('crm.pipeline.give_named', 'Give {{name}} to', { name })}>
          {others.map(owner => (
            <li key={owner ?? ''}>
              <Button size="sm" variant="secondary" onClick={() => { setOpen(false); onGive(owner) }}>{label(owner)}</Button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
