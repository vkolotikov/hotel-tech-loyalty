import { Fragment, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ChevronDown, ExternalLink, Globe, ListPlus, Mail, Phone, Sparkles, Trash2, Trophy, UserRound, XCircle } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, money, timeAgo } from '../lib/format'
import { contactPath, leadPath } from '../lib/links'
import { Avatar } from '../ui/Avatar'
import { Pill } from '../ui/Pill'
import { useToast } from '../ui/Toast'
import { useLeadChanged, useLeadSettings } from './leadData'
import { amount, customText, dayOf, followUp, kindOf, moveTo, resolveStage } from './leadLogic'
import { aiSignal, priorityTone, type LeadColumn } from './listLogic'
import { ActionMenu, type MenuItem } from './Menu'
import { AiCell, ContactLinks, FreshChip, NextCell, StagePill } from './parts'
import type { CustomField, LeadRow, Stage } from './leadTypes'
import { coldLabel, intentLabel, sourceLabel } from './leadWords'

/** What a row asks the page to open (a dialog or a form the page holds). */
export type RowAsk = { kind: 'won' | 'lost' | 'delete' | 'task'; lead: LeadRow }

/**
 * The leads as a list (round 2, as the main platform's Leads table): on a wide screen one row per lead under a header
 * row — who, the stage (changed in place), value, the AI's signal, the next step, owner and source, the touches, a
 * hotel's stay and the organisation's own list fields — with a "…" menu and a row that opens for the AI's brief and the
 * notes; on a phone each lead is a card with what matters. A box chooses it for a bulk change.
 */
export function LeadList({ leads, stages, selected, onSelect, columns, fields, onAsk, now }: {
  leads: LeadRow[]
  stages: Stage[]
  selected: ReadonlySet<number>
  onSelect: (id: number) => void
  columns: Record<LeadColumn, boolean>
  /** The organisation's fields shown as list columns (`show_in_list`). */
  fields: readonly CustomField[]
  onAsk: (ask: RowAsk) => void
  now: Date
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  const { priorities } = useLeadSettings()
  const actions = useRowActions(stages, onAsk)
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const span = 4 + (['value', 'ai_signal', 'next_task', 'owner', 'touches', 'stay'] as const).filter(c => columns[c]).length + fields.length

  return (
    <>
      {/* A wide screen: a table with a header row. */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-a-border text-left text-xs font-medium text-a-text-2">
              <th scope="col" className="w-10 py-2.5 pl-4"><span className="sr-only">{t('crm.leads.choose_col', 'Choose')}</span></th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.leads.col_lead', 'Lead')}</th>
              <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.leads.field_stage', 'Stage')}</th>
              {columns.value && <th scope="col" className="px-3 py-2.5 text-right font-medium">{t('crm.leads.col_value', 'Value')}</th>}
              {columns.ai_signal && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.leads.col_ai', 'AI signal')}</th>}
              {columns.next_task && <th scope="col" className="px-3 py-2.5 font-medium">{t('crm.leads.col_next', 'Next step')}</th>}
              {columns.owner && <th scope="col" className="hidden px-3 py-2.5 font-medium lg:table-cell">{t('crm.leads.col_owner', 'Owner and source')}</th>}
              {columns.touches && <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{t('crm.leads.col_touches', 'Calls and emails')}</th>}
              {columns.stay && <th scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{t('crm.leads.col_stay', 'Stay')}</th>}
              {fields.map(f => <th key={f.key} scope="col" className="hidden px-3 py-2.5 font-medium xl:table-cell">{f.label}</th>)}
              <th scope="col" className="w-20 py-2.5 pr-3"><span className="sr-only">{t('crm.leads.actions', 'Actions')}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-a-border">
            {leads.map(lead => {
              const isOpen = open === lead.id
              return (
                <Fragment key={lead.id}>
                  <WideRow lead={lead} name={name(lead)} stages={stages} columns={columns} fields={fields} now={now} priorities={priorities}
                    chosen={selected.has(lead.id)} onSelect={() => onSelect(lead.id)} expanded={isOpen}
                    onExpand={() => setOpen(isOpen ? null : lead.id)} actions={actions} />
                  {isOpen && (
                    <tr className="bg-a-surface-2/40">
                      <td colSpan={span} className="px-4 pb-4 pt-1"><Peek lead={lead} name={name(lead)} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* A phone: a card per lead. */}
      <ul className="divide-y divide-a-border md:hidden">
        {leads.map(lead => (
          <PhoneCard key={lead.id} lead={lead} name={name(lead)} stages={stages} now={now} priorities={priorities}
            chosen={selected.has(lead.id)} onSelect={() => onSelect(lead.id)} actions={actions} />
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
  const navigate = useNavigate()
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
      { key: 'open', label: t('crm.leads.open_lead', 'Open the lead'), icon: ExternalLink, onSelect: () => navigate(leadPath(lead.id)) },
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
    if (lead.guest_id) items.push({ key: 'contact', label: t('crm.leads.open_contact', 'Open the contact'), icon: UserRound, onSelect: () => navigate(contactPath(lead.guest_id as number)) })
    if (boot.staff.can.delete_records) items.push('divider', { key: 'delete', label: t('crm.leads.delete', 'Delete the lead'), icon: Trash2, danger: true, onSelect: () => onAsk({ kind: 'delete', lead }) })
    return items
  }
  return { stageItems, menu, busy: (id: number) => (write.isPending && write.variables?.lead.id === id) || (done.isPending && done.variables?.id === id), ask: onAsk }
}

function WideRow({ lead, name, stages, columns, fields, now, priorities, chosen, onSelect, expanded, onExpand, actions }: {
  lead: LeadRow
  name: string
  stages: Stage[]
  columns: Record<LeadColumn, boolean>
  fields: readonly CustomField[]
  now: Date
  priorities: string[]
  chosen: boolean
  onSelect: () => void
  expanded: boolean
  onExpand: () => void
  actions: Actions
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const stage = resolveStage(lead, stages)
  const value = amount(lead.total_value)
  const tone = priorityTone(lead.priority, priorities)
  const closed = kindOf(lead, stages) !== 'open'
  const country = columns.country ? lead.guest?.country : null
  return (
    <tr className={`group align-top transition-colors ${chosen ? 'bg-a-accent/8' : 'hover:bg-a-surface-2/60'} ${actions.busy(lead.id) ? 'opacity-60' : ''}`}>
      <td className="py-3 pl-4">
        <input type="checkbox" className="mt-2 h-4 w-4 accent-a-accent" checked={chosen} onChange={onSelect} aria-label={t('crm.leads.select_named', 'Choose {{name}}', { name })} />
      </td>
      <td className="px-3 py-3">
        <div className="flex min-w-0 items-start gap-3">
          <Avatar name={name} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link to={leadPath(lead.id)} className="truncate font-medium text-a-text hover:underline focus-visible:outline-2 focus-visible:outline-a-accent">{name}</Link>
              <FreshChip lead={lead} closed={closed} now={now} />
            </div>
            {(lead.guest?.company || country) && (
              <p className="flex items-center gap-1 truncate text-xs text-a-text-2">
                {lead.guest?.company}
                {country && <>{lead.guest?.company ? <span aria-hidden>·</span> : null}<Globe size={11} aria-hidden />{country}</>}
              </p>
            )}
            <p className="truncate text-xs text-a-text-2">{[lead.guest?.email, lead.guest?.phone || lead.guest?.mobile].filter(Boolean).join(' · ') || t('crm.leads.no_contact', 'No email or phone yet.')}</p>
          </div>
          <span className="shrink-0 opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100"><ContactLinks guest={lead.guest} name={name} /></span>
        </div>
      </td>
      <td className="px-3 py-3">
        <ActionMenu label={t('crm.leads.change_stage_named', 'Change the stage of {{name}}', { name })} items={actions.stageItems(lead)} align="left"
          className="inline-flex max-w-44 items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-a-accent"
          button={<><StagePill stage={stage} fallback={lead.status} /><ChevronDown size={13} aria-hidden className="shrink-0 text-a-text-2" /></>} />
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
          <span className="flex min-w-0 items-center gap-2">
            <Avatar name={lead.assigned_to} size="sm" />
            <span className="min-w-0">
              <span className={`block truncate text-sm ${lead.assigned_to ? 'text-a-text' : 'font-medium text-a-st-pending'}`}>{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</span>
              <span className="block truncate text-xs text-a-text-2">{sourceLabel(t, lead.source)}</span>
            </span>
          </span>
        </td>
      )}
      {columns.touches && (
        <td className="hidden px-3 py-3 text-xs text-a-text-2 xl:table-cell">
          <span className="inline-flex items-center gap-2 tabular-nums">
            <span className="inline-flex items-center gap-1" title={t('crm.leads.calls', 'Calls')}><Phone size={12} aria-hidden />{lead.phone_calls_made ?? 0}</span>
            <span className="inline-flex items-center gap-1" title={t('crm.leads.emails', 'Emails')}><Mail size={12} aria-hidden />{lead.emails_sent ?? 0}</span>
          </span>
          {lead.last_contacted_at && <span className="block">{timeAgo(lead.last_contacted_at, lang)}</span>}
        </td>
      )}
      {columns.stay && (
        <td className="hidden px-3 py-3 text-xs xl:table-cell">
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
        return <td key={f.key} className="hidden max-w-40 truncate px-3 py-3 text-xs text-a-text xl:table-cell">{text || <span className="text-a-text-2">—</span>}</td>
      })}
      <td className="py-2 pr-3">
        <span className="flex items-center justify-end gap-0.5">
          <button type="button" onClick={onExpand} aria-expanded={expanded} aria-label={expanded ? t('crm.leads.peek_close', 'Show less about {{name}}', { name }) : t('crm.leads.peek_open', 'Show more about {{name}}', { name })}
            className="grid h-9 w-9 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent">
            <ChevronDown size={16} aria-hidden className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
          <ActionMenu label={t('crm.leads.menu_named', 'More for {{name}}', { name })} items={actions.menu(lead, priorities)} />
        </span>
      </td>
    </tr>
  )
}

/** A row opened: what the AI read, the next step's note, the notes and the last touch. */
function Peek({ lead, name }: { lead: LeadRow; name: string }) {
  const { t, i18n } = useTranslation()
  const ai = aiSignal(lead)
  return (
    <div className="grid gap-3 rounded-xl border border-a-border bg-a-surface p-3 animate-a-fade md:grid-cols-3">
      <div className="crm-ai-border rounded-lg border p-3">
        <p className="crm-ai-text mb-1 inline-flex items-center gap-1.5 text-xs font-semibold"><Sparkles size={13} aria-hidden />{t('crm.leads.ai_title', 'AI brief')}</p>
        {ai ? (
          <>
            {ai.action && <p className="text-sm text-a-text"><span className="crm-ai-text font-medium">{t('crm.leads.ai_next', 'Next:')}</span> {ai.action}</p>}
            {ai.brief && <p className="mt-1 line-clamp-4 text-sm text-a-text-2">{ai.brief}</p>}
            <p className="mt-1.5 flex flex-wrap gap-1.5">
              {intentLabel(t, ai.intent) && <Pill tone="ai">{intentLabel(t, ai.intent)}</Pill>}
              {coldLabel(t, ai.cold) && <Pill tone={ai.cold === 'high' ? 'danger' : ai.cold === 'medium' ? 'pending' : 'success'}>{coldLabel(t, ai.cold)}</Pill>}
            </p>
          </>
        ) : <p className="text-sm text-a-text-2">{t('crm.leads.peek_no_ai', 'The AI has not read this lead yet. Open it to ask for a brief.')}</p>}
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-semibold text-a-text-2">{t('crm.leads.next_step', 'Next step')}</p>
        <p className="text-sm text-a-text">{lead.next_task_type && !lead.next_task_completed ? lead.next_task_type : t('crm.leads.no_next', 'No next step')}</p>
        {lead.next_task_notes && !lead.next_task_completed && <p className="mt-0.5 line-clamp-3 text-sm text-a-text-2">{lead.next_task_notes}</p>}
        <p className="mb-1 mt-3 text-xs font-semibold text-a-text-2">{t('crm.leads.field_notes_short', 'Notes')}</p>
        <p className="line-clamp-4 whitespace-pre-wrap text-sm text-a-text">{lead.notes || <span className="text-a-text-2">{t('crm.leads.no_notes', 'No notes.')}</span>}</p>
      </div>
      <div className="min-w-0 space-y-2 text-sm">
        <p className="text-xs font-semibold text-a-text-2">{t('crm.leads.contact', 'Contact')}</p>
        <ContactLinks guest={lead.guest} name={name} />
        <p className="text-a-text-2">
          {lead.last_contacted_at ? t('crm.leads.last_touch_at', 'Last touch {{when}}', { when: timeAgo(lead.last_contacted_at, i18n.language) }) : t('crm.leads.never_touched', 'Nobody has been in touch yet.')}
        </p>
        <Link to={leadPath(lead.id)} className="inline-flex items-center gap-1 font-medium text-a-accent-text hover:underline">{t('crm.leads.open_lead', 'Open the lead')}<ExternalLink size={13} aria-hidden /></Link>
      </div>
    </div>
  )
}

function PhoneCard({ lead, name, stages, now, priorities, chosen, onSelect, actions }: {
  lead: LeadRow
  name: string
  stages: Stage[]
  now: Date
  priorities: string[]
  chosen: boolean
  onSelect: () => void
  actions: Actions
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const stage = resolveStage(lead, stages)
  const value = amount(lead.total_value)
  const closed = kindOf(lead, stages) !== 'open'
  return (
    <li className={`flex items-start gap-3 px-4 py-3 ${chosen ? 'bg-a-accent/8' : ''}`}>
      <input type="checkbox" className="mt-3 h-4 w-4 shrink-0 accent-a-accent" checked={chosen} onChange={onSelect} aria-label={t('crm.leads.select_named', 'Choose {{name}}', { name })} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <Link to={leadPath(lead.id)} className="truncate text-sm font-medium text-a-text hover:underline">{name}</Link>
              <FreshChip lead={lead} closed={closed} now={now} />
            </div>
            {lead.guest?.company && <p className="truncate text-xs text-a-text-2">{lead.guest.company}</p>}
          </div>
          <ActionMenu label={t('crm.leads.menu_named', 'More for {{name}}', { name })} items={actions.menu(lead, priorities)} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ActionMenu label={t('crm.leads.change_stage_named', 'Change the stage of {{name}}', { name })} items={actions.stageItems(lead)} align="left"
            className="inline-flex min-h-8 items-center gap-1 rounded-full focus-visible:outline-2 focus-visible:outline-a-accent"
            button={<><StagePill stage={stage} fallback={lead.status} /><ChevronDown size={13} aria-hidden className="text-a-text-2" /></>} />
          {lead.priority && <Pill tone={priorityTone(lead.priority, priorities) ?? 'neutral'}>{lead.priority}</Pill>}
          <AiCell lead={lead} compact />
        </div>
        <NextCell lead={lead} today={boot.venue.today} lang={lang} />
        <p className="flex flex-wrap items-center gap-x-3 text-xs text-a-text-2">
          {value !== null && <span className="font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>}
          <span>{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</span>
          <span>{sourceLabel(t, lead.source)}</span>
        </p>
      </div>
    </li>
  )
}
