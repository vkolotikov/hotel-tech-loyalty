import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Activity, CalendarClock, Mail, MessageCircle, MessageSquare, Phone, Plus, Send, StickyNote, Target, X, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, money, timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { TextArea, TextInput } from '../ui/inputs'
import { Popover } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import {
  ACTIVITY_TYPES, LEAD_TONE, activityBody, activityKey, displayName, impactSummary, leadState, newLeadFor, tagIdsWith, tagIdsWithout, tagNameError,
  tagsToOffer, type ActivityType, type ImpactKey,
} from './contactsLogic'
import { PRIMARY_LINK } from './parts'
import { CONTACTS, refreshAfterContactChange, useTags } from './queries'
import type { DeleteImpact, Guest, GuestActivity, GuestLead, GuestTag } from './types'

const ACTIVITY_ICON: Record<string, LucideIcon> = { note: StickyNote, call: Phone, email: Mail, sms: MessageSquare, whatsapp: MessageCircle }
const ACTIVITY_FALLBACK: Record<string, string> = {
  'activity.note': 'Note', 'activity.call': 'Call', 'activity.email': 'Email', 'activity.sms': 'SMS', 'activity.whatsapp': 'WhatsApp', 'activity.other': 'Activity',
}

/** A contact's tags beside the name: each removed with its ×, one added (or made and added) from the + button. */
export function TagBadges({ guest }: { guest: Guest }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const all = useTags()
  const worn = guest.tags ?? []
  const offer = tagsToOffer(all.data ?? [], worn)
  const [name, setName] = useState('')
  const [nameProblem, setNameProblem] = useState<string | null>(null)

  const sync = useMutation({
    mutationFn: (ids: number[]) => send<GuestTag[]>('post', `guests/${guest.id}/tags`, { tag_ids: ids }),
    onSuccess: tags => {
      qc.setQueryData<Guest>([...CONTACTS, 'one', guest.id], old => (old ? { ...old, tags } : old))
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'list'] })
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const create = useMutation({
    mutationFn: (tagName: string) => send<GuestTag>('post', 'guests/tags', { name: tagName }),
    onSuccess: tag => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'tags'] })
      setName('')
      sync.mutate(tagIdsWith(worn, tag.id))
    },
    onError: error => {
      const f = failureOf(error)
      setNameProblem(f.fields?.name ? t('crm.contacts.tag_taken', 'This name is taken. Choose it from the list, or pick another.') : errorText(t, error))
    },
  })
  const makeTag = () => {
    const why = tagNameError(name, all.data ?? [])
    if (why) {
      setNameProblem(why === 'required' ? t('crm.contacts.form.required', 'Fill this in.')
        : why === 'too_long' ? t('crm.contacts.form.too_long_max', 'Keep it to {{max}} characters.', { max: 80 })
        : t('crm.contacts.tag_exists', 'This tag exists already: choose it from the list.'))
      return
    }
    setNameProblem(null)
    create.mutate(name.trim())
  }
  const busy = sync.isPending || create.isPending

  return (
    <ul aria-label={t('crm.contacts.tags', 'Tags')} className="flex flex-wrap items-center gap-1">
      {worn.map(tag => (
        <li key={tag.id} className="inline-flex items-center gap-0.5 rounded-full border border-a-border bg-a-surface-2 py-0.5 pl-2 pr-0.5 text-xs font-medium text-a-text">
          {tag.name}
          <button type="button" disabled={busy} onClick={() => sync.mutate(tagIdsWithout(worn, tag.id))}
            className="grid h-5 w-5 place-items-center rounded-full text-a-text-2 hover:text-a-danger focus-visible:outline-2 focus-visible:outline-a-accent disabled:opacity-50"
            aria-label={t('crm.contacts.remove_tag', 'Remove the tag {{name}}', { name: tag.name })}>
            <X size={11} aria-hidden />
          </button>
        </li>
      ))}
      <li>
        <Popover label={t('crm.contacts.add_tag', 'Add a tag')} align="left" width="w-72"
          className="inline-flex h-6 items-center gap-1 rounded-full border border-dashed border-a-border px-2 text-xs font-medium text-a-accent-text hover:border-a-accent/50 focus-visible:outline-2 focus-visible:outline-a-accent"
          button={<><Plus size={12} aria-hidden />{worn.length === 0 ? t('crm.contacts.tag', 'Tag') : null}</>}>
          <div className="space-y-2 p-1">
            {offer.length > 0 && (
              <ul className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
                {offer.map(tag => (
                  <li key={tag.id}>
                    <button type="button" data-close disabled={busy} onClick={() => sync.mutate(tagIdsWith(worn, tag.id))}
                      className="min-h-8 rounded-full border border-a-border bg-a-surface px-2.5 text-xs text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
                      {tag.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="flex items-end gap-1.5" onSubmit={e => { e.preventDefault(); makeTag() }}>
              <div className="min-w-0 flex-1">
                <Field label={t('crm.contacts.new_tag', 'New tag')}>
                  <TextInput value={name} onChange={e => { setName(e.target.value); setNameProblem(null) }} maxLength={80} autoComplete="off" />
                </Field>
              </div>
              <Button type="submit" variant="secondary" size="sm" className="min-h-10" disabled={!name.trim() || busy} loading={create.isPending}><Plus size={14} aria-hidden />{t('crm.contacts.create_tag', 'Create')}</Button>
            </form>
            {nameProblem && <p role="alert" className="text-xs text-a-danger">{nameProblem}</p>}
          </div>
        </Popover>
      </li>
    </ul>
  )
}

/** Deleting a contact, asked first with what goes with them (delete-impact); a venue booking naming them blocks it. */
export function ContactDelete({ guest, onClose, onDeleted }: { guest: Guest; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const impact = useQuery({ queryKey: [...CONTACTS, 'impact', guest.id], queryFn: () => get<DeleteImpact>(`guests/${guest.id}/delete-impact`) })
  const remove = useMutation({
    mutationFn: () => send('delete', `guests/${guest.id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...CONTACTS, 'one', guest.id] })
      refreshAfterContactChange(qc, { leadsToo: true })
      toast(t('crm.contacts.deleted', 'Contact deleted'))
      onDeleted()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const name = displayName(guest) ?? t('crm.common.no_name', 'No name')
  const summary = impactSummary(impact.data)
  const impactWords = (key: ImpactKey, count: number): string => key === 'inquiries' ? t('crm.contacts.impact.inquiries', 'Leads: {{count}}', { count })
    : key === 'lead_tasks' ? t('crm.contacts.impact.lead_tasks', 'Their leads’ tasks: {{count}}', { count })
    : key === 'activities' ? t('crm.contacts.impact.activities', 'Timeline entries: {{count}}', { count })
    : key === 'chats' ? t('crm.contacts.impact.chats', 'Chats in the inbox: {{count}}', { count })
    : t('crm.contacts.impact.reservations', 'Bookings: {{count}}', { count })

  if (summary.blocked !== null) {
    return (
      <Dialog title={t('crm.contacts.delete_title', 'Delete {{name}}?', { name })} onClose={onClose}>
        <div className="space-y-4 text-sm text-a-text-2">
          <Notice tone="warning">{t('crm.contacts.delete_blocked', 'This contact is named on {{count}} venue bookings, so it cannot be deleted. Name someone else on those bookings first.', { count: summary.blocked })}</Notice>
          <div className="flex justify-end"><Button variant="secondary" onClick={onClose}>{t('crm.common.close', 'Close')}</Button></div>
        </div>
      </Dialog>
    )
  }
  return (
    <Confirm title={t('crm.contacts.delete_title', 'Delete {{name}}?', { name })} confirm={t('crm.contacts.delete_confirm', 'Delete for good')}
      busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={onClose}>
      <div className="space-y-2">
        <p>{t('crm.contacts.delete_line', 'The contact is deleted for good. This cannot be undone.')}</p>
        {impact.isLoading && <p role="status">{t('crm.contacts.delete_checking', 'Checking what goes with them…')}</p>}
        {impact.isError && <p>{t('crm.contacts.delete_unknown', 'We could not check what goes with them. Their leads and timeline go too.')}</p>}
        {summary.removes.length > 0 && (
          <>
            <p className="font-medium text-a-text">{t('crm.contacts.delete_also', 'Deleted with them:')}</p>
            <ul className="list-disc space-y-0.5 pl-5">{summary.removes.map(line => <li key={line.key}>{impactWords(line.key, line.count)}</li>)}</ul>
          </>
        )}
        {summary.kept.length > 0 && (
          <>
            <p className="font-medium text-a-text">{t('crm.contacts.delete_kept', 'Kept, no longer linked:')}</p>
            <ul className="list-disc space-y-0.5 pl-5">{summary.kept.map(line => <li key={line.key}>{impactWords(line.key, line.count)}</li>)}</ul>
          </>
        )}
        {impact.data && summary.removes.length === 0 && summary.kept.length === 0 && <p>{t('crm.contacts.delete_nothing', 'Nothing else is linked to them.')}</p>}
      </div>
    </Confirm>
  )
}

/** One lead in a record's Leads tab: what it is, when, its next step, its value and its state; it opens in its panel. */
export function LeadRow({ id, title, sub, status, value }: { id: number; title: string; sub: string; status: string | null; value: string | number | null }) {
  const { i18n } = useTranslation()
  const boot = useBoot()
  const records = useRecords()
  return (
    <li>
      <Link to={records.href('lead', id)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
        <span aria-hidden className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${status ? 'bg-a-st-progress/12 text-a-st-progress' : 'bg-a-surface-2 text-a-text-2'}`}><Target size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-a-text">{title}</span>
          {sub && <span className="block truncate text-xs text-a-text-2">{sub}</span>}
        </span>
        {value !== null && Number(value) > 0 && <span className="hidden shrink-0 text-xs text-a-text-2 sm:block">{money(value, boot.venue.currency, i18n.language)}</span>}
        {status && <Pill tone={LEAD_TONE[leadState(status)]}>{status}</Pill>}
      </Link>
    </li>
  )
}

/** A contact's leads (newest first), each opening in its panel, and a new one for them. */
export function ContactLeads({ id, rows, loading, error, onRetry }: { id: number; rows: GuestLead[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const newLead = (
    <Link to={newLeadFor(id)} className={PRIMARY_LINK}>
      <Plus size={15} aria-hidden />{t('crm.contacts.new_lead_short', 'New lead')}
    </Link>
  )
  return (
    <QueryState loading={loading} error={error} onRetry={onRetry} rows={2}>
      {rows.length === 0
        ? <EmptyState icon={Target} title={t('crm.contacts.no_leads', 'No leads yet')} action={newLead} />
        : (
          <div className="space-y-2">
            <div className="flex justify-end">{newLead}</div>
            <ul className="-mx-2 divide-y divide-a-border/60">
              {rows.map(lead => (
                <LeadRow key={lead.id} id={lead.id} status={lead.status} value={lead.total_value}
                  title={lead.inquiry_type || t('crm.contacts.lead_number', 'Lead #{{id}}', { id: lead.id })}
                  sub={[timeAgo(lead.created_at, lang),
                    lead.next_task_due && !lead.next_task_completed ? t('crm.contacts.next_step', 'Next step {{day}}', { day: dayLabel(lead.next_task_due, lang) }) : null,
                  ].filter(Boolean).join(' · ')} />
              ))}
            </ul>
          </div>
        )}
    </QueryState>
  )
}

/** The timeline: a touch logged in one line (its kind as an icon), then every touch, newest first. */
export function ContactActivity({ id, rows, loading, error, onRetry }: { id: number; rows: GuestActivity[]; loading: boolean; error: unknown; onRetry: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState<ActivityType>('note')
  const [text, setText] = useState('')
  const body = activityBody(type, text, boot.staff.name)
  const add = useMutation({
    mutationFn: () => send<GuestActivity>('post', `guests/${id}/activities`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'timeline', id] })
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'one', id] })
      setText('')
      toast(t('crm.contacts.logged', 'Added to the timeline'))
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const labelOf = (kind: string) => t(`crm.contacts.${activityKey(kind)}`, ACTIVITY_FALLBACK[activityKey(kind)])

  return (
    <div className="space-y-4">
      <form className="rounded-xl border border-a-border bg-a-surface-2/40 p-2" onSubmit={e => { e.preventDefault(); if (body) add.mutate() }}>
        <div role="group" aria-label={t('crm.contacts.log_kind', 'What kind of touch')} className="mb-1.5 flex flex-wrap gap-1">
          {ACTIVITY_TYPES.map(key => {
            const Icon = ACTIVITY_ICON[key] ?? Activity
            const on = key === type
            return (
              <button key={key} type="button" aria-pressed={on} onClick={() => setType(key)}
                className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'bg-a-accent text-a-accent-ink' : 'text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
                <Icon size={13} aria-hidden />{labelOf(key)}
              </button>
            )
          })}
        </div>
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t('crm.contacts.log_what', 'What happened')}</span>
            <TextArea rows={2} value={text} onChange={e => setText(e.target.value)} placeholder={t('crm.contacts.log_what', 'What happened')}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body) { e.preventDefault(); add.mutate() } }} />
          </label>
          <Button type="submit" size="sm" className="min-h-10" disabled={!body} loading={add.isPending} aria-label={t('crm.contacts.log_add', 'Add to the timeline')} title={t('crm.contacts.log_add', 'Add to the timeline')}>
            <Send size={14} aria-hidden />
          </Button>
        </div>
      </form>
      <QueryState loading={loading} error={error} onRetry={onRetry} rows={3}>
        {rows.length === 0
          ? <EmptyState icon={CalendarClock} title={t('crm.contacts.timeline_empty', 'Nothing on the timeline yet.')} />
          : (
            <ol className="space-y-3">
              {rows.map(row => {
                const Icon = ACTIVITY_ICON[row.type] ?? Activity
                return (
                  <li key={row.id} className="flex items-start gap-3">
                    <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-a-surface-2 text-a-text-2"><Icon size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="font-medium text-a-text">{labelOf(row.type)}</span>
                        {row.performed_by && <span className="text-xs text-a-text-2">{row.performed_by}</span>}
                        <time className="ml-auto text-xs text-a-text-2" dateTime={row.created_at ?? undefined} title={dateTime(row.created_at, lang, boot.venue.timezone)}>{timeAgo(row.created_at, lang)}</time>
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-a-text-2">{row.description}</p>
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
      </QueryState>
    </div>
  )
}
