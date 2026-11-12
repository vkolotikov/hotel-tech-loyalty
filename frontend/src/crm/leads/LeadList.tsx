import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ChevronDown, ExternalLink, Globe, ListPlus, Mail, Phone, Trash2, Trophy, UserRound, XCircle } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, money, timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Pill } from '../ui/Pill'
import { useToast } from '../ui/Toast'
import { useLeadChanged, useLeadSettings } from './leadData'
import { amount, customText, dayOf, followUp, kindOf, moveTo, resolveStage } from './leadLogic'
import { priorityTone, type LeadColumn } from './listLogic'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { AiCell, ContactLinks, FreshChip, NextCell, StagePill } from './parts'
import type { CustomField, LeadRow, Stage } from './leadTypes'
import { sourceLabel } from './leadWords'
import { rowOpens } from './recordLogic'

/** What a row asks the page to open (a dialog or a form the page holds). */
export type RowAsk = { kind: 'won' | 'lost' | 'delete' | 'task'; lead: LeadRow }

/**
 * The leads as a list (round 2, as the main platform's Leads table; round 5, owner 2026-11-12: "opening tabs, slides
 * or popups"): a lead opens in its panel over the list — its name is the link (Ctrl-click still opens a tab), a press
 * on the row's empty space does the same — so round 2's "Show more" is gone: the panel holds all it showed and more,
 * one press away, with previous and next. On a wide screen one row per lead under a header row — who, the stage
 * (changed in place), value, the AI's signal, the next step, owner and source, the touches, a hotel's stay and the
 * organisation's own list fields — with a "…" menu; on a phone each lead is a card. A box chooses it for a bulk change.
 */
export function LeadList({ leads, stages, selected, onSelect, onSelectAll, columns, fields, onAsk, now }: {
  leads: LeadRow[]
  stages: Stage[]
  selected: ReadonlySet<number>
  onSelect: (id: number) => void
  /** Choose (or let go of) every lead shown; none on a list of the "due now" sections. */
  onSelectAll?: () => void
  columns: Record<LeadColumn, boolean>
  /** The organisation's fields shown as list columns (`show_in_list`). */
  fields: readonly CustomField[]
  onAsk: (ask: RowAsk) => void
  now: Date
}) {
  const { t } = useTranslation()
  const { priorities } = useLeadSettings()
  const records = useRecords()
  const actions = useRowActions(stages, onAsk)
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const all = leads.length > 0 && leads.every(l => selected.has(l.id))
  const row = { stages, now, priorities, actions, href: (id: number) => records.href('lead', id), open: (id: number) => records.open('lead', id) }

  return (
    <>
      {/* A wide screen: a table with a header row. */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-a-border text-left text-xs font-medium text-a-text-2">
              <th scope="col" className="w-10 py-2.5 pl-4">
                {onSelectAll
                  ? <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={all} onChange={onSelectAll} aria-label={t('crm.leads.select_page', 'Select this page')} title={t('crm.leads.select_page', 'Select this page')} />
                  : <span className="sr-only">{t('crm.leads.choose_col', 'Choose')}</span>}
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.leads.col_lead', 'Lead')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.leads.field_stage', 'Stage')}</th>
              {columns.value && <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('crm.leads.col_value', 'Value')}</th>}
              {columns.ai_signal && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.leads.col_ai_short', 'AI')}</th>}
              {columns.next_task && <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.leads.col_next', 'Next step')}</th>}
              {columns.owner && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.leads.col_owner_short', 'Owner')}</th>}
              {columns.touches && <th scope="col" className="hidden px-3 py-2.5 font-medium 2xl:table-cell">{t('crm.leads.col_touches', 'Calls and emails')}</th>}
              {columns.stay && <th scope="col" className="hidden px-3 py-2.5 font-medium 2xl:table-cell">{t('crm.leads.col_stay', 'Stay')}</th>}
              {fields.map(f => <th key={f.key} scope="col" className="hidden px-3 py-2.5 font-medium 2xl:table-cell">{f.label}</th>)}
              <th scope="col" className="w-12 py-2.5 pr-3"><span className="sr-only">{t('crm.leads.actions', 'Actions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-a-border">
            {leads.map(lead => (
              <WideRow key={lead.id} lead={lead} name={name(lead)} columns={columns} fields={fields} chosen={selected.has(lead.id)} onSelect={() => onSelect(lead.id)} {...row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* A phone: a card per lead. */}
      <ul className="divide-y divide-a-border md:hidden">
        {leads.map(lead => (
          <PhoneCard key={lead.id} lead={lead} name={name(lead)} chosen={selected.has(lead.id)} onSelect={() => onSelect(lead.id)} {...row} />
        ))}
      </ul>
    </>
  )
}

type Actions = ReturnType<typeof useRowActions>

/** What a row can do in place (the stage, the priority, the next step done) and the menu's items. */
function useRowActions(stages: Stage[], onAsk: (ask: RowAsk) => void) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const records = useRecords()
  const write = useMutation({
    mutationFn: ({ lead, body }: { lead: LeadRow; body: Record<string, unknown>; said: string }) => send('put', `inquiries/${lead.id}`, body),
    onSuccess: (_r, { said }) => { changed(); toast(said) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const done = useMutation({
    mutationFn: (lead: LeadRow) => send('post', `inquiries/${lead.id}/complete-task`),
    onSuccess: () => { changed(); toast(t('crm.leads.next_done', 'Next step done')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const pickStage = (lead: LeadRow, target: Stage) => {
    const action = moveTo(lead, target, stages)
    if (action.kind === 'won' || action.kind === 'lost') onAsk({ kind: action.kind, lead })
    else if (action.kind === 'stage') write.mutate({ lead, body: { status: action.status }, said: t('crm.leads.moved', 'Moved to {{stage}}', { stage: action.status }) })
  }
  const stageItems = (lead: LeadRow): MenuItem[] => {
    const current = resolveStage(lead, stages)
    return stages.map(stage => ({
      key: `s${stage.id}`, label: stage.name, checked: current?.id === stage.id, icon: stage.kind === 'won' ? Trophy : stage.kind === 'lost' ? XCircle : undefined,
      onSelect: () => pickStage(lead, stage),
    }))
  }
  const menu = (lead: LeadRow, priorities: string[]): (MenuItem | 'divider' | { heading: string })[] => {
    const kind = kindOf(lead, stages)
    const items: (MenuItem | 'divider' | { heading: string })[] = [
      { key: 'open', label: t('crm.leads.open_lead', 'Open the lead'), icon: ExternalLink, onSelect: () => records.open('lead', lead.id) },
      { key: 'task', label: t('crm.leads.task_add_short', 'Add a task'), icon: ListPlus, onSelect: () => onAsk({ kind: 'task', lead }) },
    ]
    if (followUp(lead, boot.venue.today)) items.push({ key: 'done', label: t('crm.leads.next_mark_done_long', 'Next step done'), icon: CheckCircle2, onSelect: () => done.mutate(lead) })
    if (priorities.length) {
      items.push('divider', { heading: t('crm.leads.field_priority', 'Priority') })
      for (const p of priorities) {
        items.push({ key: `p${p}`, label: p, checked: (lead.priority ?? '').toLowerCase() === p.toLowerCase(),
          onSelect: () => write.mutate({ lead, body: { priority: p }, said: t('crm.leads.priority_set', 'Priority: {{priority}}', { priority: p }) }) })
      }
    }
    items.push('divider')
    if (kind !== 'won') items.push({ key: 'won', label: t('crm.leads.won_confirm', 'Mark won'), icon: Trophy, onSelect: () => onAsk({ kind: 'won', lead }) })
    if (kind !== 'lost') items.push({ key: 'lost', label: t('crm.leads.lost_confirm', 'Mark lost'), icon: XCircle, onSelect: () => onAsk({ kind: 'lost', lead }) })
    if (lead.guest_id) items.push({ key: 'contact', label: t('crm.leads.open_contact', 'Open the contact'), icon: UserRound, onSelect: () => records.open('contact', lead.guest_id as number) })
    if (boot.staff.can.delete_records) items.push('divider', { key: 'delete', label: t('crm.leads.delete', 'Delete the lead'), icon: Trash2, danger: true, onSelect: () => onAsk({ kind: 'delete', lead }) })
    return items
  }
  return { stageItems, menu, busy: (id: number) => (write.isPending && write.variables?.lead.id === id) || (done.isPending && done.variables?.id === id), ask: onAsk }
}

interface RowProps {
  lead: LeadRow
  name: string
  stages: Stage[]
  now: Date
  priorities: string[]
  chosen: boolean
  onSelect: () => void
  actions: Actions
  href: (id: number) => string
  open: (id: number) => void
}

function StageMenu({ lead, name, stages, actions, wide }: Pick<RowProps, 'lead' | 'name' | 'stages' | 'actions'> & { wide: boolean }) {
  const { t } = useTranslation()
  const stage = resolveStage(lead, stages)
  return (
    <ActionMenu label={t('crm.leads.change_stage_named', 'Change the stage of {{name}}', { name })} items={actions.stageItems(lead)} align="left"
      className={`inline-flex items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-a-accent ${wide ? 'max-w-44' : 'min-h-8'}`}
      button={<><StagePill stage={stage} fallback={lead.status} /><ChevronDown size={13} aria-hidden className="shrink-0 text-a-text-2" /></>} />
  )
}

function WideRow({ lead, name, stages, columns, fields, now, priorities, chosen, onSelect, actions, href, open }: RowProps & {
  columns: Record<LeadColumn, boolean>
  fields: readonly CustomField[]
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const value = amount(lead.total_value)
  const tone = priorityTone(lead.priority, priorities)
  const closed = kindOf(lead, stages) !== 'open'
  const country = columns.country ? lead.guest?.country : null
  return (
    <tr onClick={e => { if (rowOpens(e.target as Element | null, e.defaultPrevented)) open(lead.id) }}
      className={`group cursor-pointer align-top transition-colors ${chosen ? 'bg-a-accent/8' : 'hover:bg-a-surface-2/60'} ${actions.busy(lead.id) ? 'opacity-60' : ''}`}>
      <td className="py-3 pl-4">
        <input type="checkbox" className="mt-2 h-4 w-4 accent-a-accent" checked={chosen} onChange={onSelect} aria-label={t('crm.leads.select_named', 'Choose {{name}}', { name })} />
      </td>
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link to={href(lead.id)} className="truncate font-medium text-a-text hover:underline focus-visible:outline-2 focus-visible:outline-a-accent">{name}</Link>
              <FreshChip lead={lead} closed={closed} now={now} />
            </div>
            {(lead.guest?.company || country) && (
              <p className="flex items-center gap-1 truncate text-xs text-a-text-2">
                {lead.guest?.company}
                {country && <>{lead.guest?.company ? <span aria-hidden>·</span> : null}<Globe size={11} aria-hidden />{country}</>}
              </p>
            )}
          </div>
          <span className="shrink-0 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100"><ContactLinks guest={lead.guest} name={name} /></span>
        </div>
      </td>
      <td className="px-3 py-3">
        <StageMenu lead={lead} name={name} stages={stages} actions={actions} wide />
        {lead.priority && tone && <div className="mt-1.5"><Pill tone={tone}>{lead.priority}</Pill></div>}
      </td>
      {columns.value && (
        <td className="px-3 py-3 text-right tabular-nums">
          {value === null ? <span className="text-a-text-2">—</span> : <span className="font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>}
        </td>
      )}
      {columns.ai_signal && <td className="hidden px-3 py-3 lg:table-cell"><AiCell lead={lead} /></td>}
      {columns.next_task && (
        <td className="max-w-48 px-3 py-3"><NextCell lead={lead} today={boot.venue.today} lang={lang} onAdd={() => actions.ask({ kind: 'task', lead })} /></td>
      )}
      {columns.owner && (
        <td className="hidden max-w-44 px-3 py-3 lg:table-cell">
          <span className="flex min-w-0 items-center gap-2" title={sourceLabel(t, lead.source)}>
            <Avatar name={lead.assigned_to} size="sm" />
            <span className="min-w-0">
              <span className={`block truncate text-sm ${lead.assigned_to ? 'text-a-text' : 'font-medium text-a-st-pending'}`}>{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</span>
              <span className="block truncate text-xs text-a-text-2">{sourceLabel(t, lead.source)}</span>
            </span>
          </span>
        </td>
      )}
      {columns.touches && (
        <td className="hidden px-3 py-3 text-xs text-a-text-2 2xl:table-cell">
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span className="inline-flex items-center gap-1" title={t('crm.leads.calls', 'Calls')}><Phone size={12} aria-hidden />{lead.phone_calls_made ?? 0}</span>
            <span className="inline-flex items-center gap-1" title={t('crm.leads.emails', 'Emails')}><Mail size={12} aria-hidden />{lead.emails_sent ?? 0}</span>
          </span>
          {lead.last_contacted_at && <span className="block">{timeAgo(lead.last_contacted_at, lang)}</span>}
        </td>
      )}
      {columns.stay && (
        <td className="hidden px-3 py-3 text-xs 2xl:table-cell">
          {dayOf(lead.check_in) || dayOf(lead.check_out) ? (
            <>
              <span className="block whitespace-nowrap text-a-text">{dayLabel(dayOf(lead.check_in), lang) || '—'} → {dayLabel(dayOf(lead.check_out), lang) || '—'}</span>
              {(lead.num_rooms ?? 0) > 0 && <span className="block text-a-text-2">{t('crm.leads.rooms_count', '{{count}} rooms', { count: lead.num_rooms ?? 0 })}</span>}
            </>
          ) : <span className="text-a-text-2">—</span>}
        </td>
      )}
      {fields.map(f => {
        const text = customText(f, lead.custom_data?.[f.key], t('crm.common.yes', 'Yes'), t('crm.common.no', 'No'))
        return <td key={f.key} className="hidden max-w-40 truncate px-3 py-3 text-xs text-a-text 2xl:table-cell">{text || <span className="text-a-text-2">—</span>}</td>
      })}
      <td className="py-2 pr-3">
        <span className="flex items-center justify-end">
          <ActionMenu label={t('crm.leads.menu_named', 'More for {{name}}', { name })} items={actions.menu(lead, priorities)} />
        </span>
      </td>
    </tr>
  )
}

function PhoneCard({ lead, name, stages, now, priorities, chosen, onSelect, actions, href }: RowProps) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const value = amount(lead.total_value)
  const closed = kindOf(lead, stages) !== 'open'
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${chosen ? 'bg-a-accent/8' : ''}`}>
      <input type="checkbox" className="mt-3 h-4 w-4 shrink-0 accent-a-accent" checked={chosen} onChange={onSelect} aria-label={t('crm.leads.select_named', 'Choose {{name}}', { name })} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link to={href(lead.id)} className="truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
              <FreshChip lead={lead} closed={closed} now={now} />
            </div>
            {lead.guest?.company && <p className="truncate text-xs text-a-text-2">{lead.guest.company}</p>}
          </div>
          {value !== null && <span className="shrink-0 pt-0.5 text-sm font-medium tabular-nums text-a-text">{money(value, boot.venue.currency, lang)}</span>}
          <ActionMenu label={t('crm.leads.menu_named', 'More for {{name}}', { name })} items={actions.menu(lead, priorities)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StageMenu lead={lead} name={name} stages={stages} actions={actions} wide={false} />
          {lead.priority && <Pill tone={priorityTone(lead.priority, priorities) ?? 'neutral'}>{lead.priority}</Pill>}
          <AiCell lead={lead} compact />
        </div>
        <div className="flex items-start gap-3">
          <span className="min-w-0 flex-1"><NextCell lead={lead} today={boot.venue.today} lang={lang} /></span>
          <span className="flex min-w-0 shrink-0 items-center gap-1.5 text-xs text-a-text-2"><Avatar name={lead.assigned_to} size="sm" /><span className="max-w-28 truncate">{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</span></span>
        </div>
      </div>
    </li>
  )
}
