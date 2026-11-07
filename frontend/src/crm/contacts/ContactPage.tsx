import { useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity, ArrowLeft, Check, Mail, MessageCircle, MessageSquare, Pencil, Phone, Plus, StickyNote, Tag, Target, Trash2, UserRound, X,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { failureOf, get, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, money, timeAgo } from '../lib/format'
import { leadPath } from '../lib/links'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextArea, TextInput } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import {
  ACTIVITY_TYPES, LEAD_TONE, activityBody, activityKey, displayName, fieldPatch, impactLines, leadState, mailLink, newLeadFor, optionsWith,
  phoneLink, tagIdsWith, tagIdsWithout, tagNameError, tagsToOffer, type ActivityType, type FieldKey,
} from './contactsLogic'
import { StandingPills } from './parts'
import { CONTACTS, refreshAfterContactChange, useContactLists, useTags } from './queries'
import type { DeleteImpact, Guest, GuestActivity, GuestLead, GuestTag } from './types'

const ACTIVITY_ICON: Record<string, LucideIcon> = { note: StickyNote, call: Phone, email: Mail, sms: MessageSquare, whatsapp: MessageCircle }
const ACTIVITY_FALLBACK: Record<string, string> = {
  'activity.note': 'Note', 'activity.call': 'Call', 'activity.email': 'Email', 'activity.sms': 'SMS', 'activity.whatsapp': 'WhatsApp', 'activity.other': 'Activity',
}

/**
 * One contact (2026-11-07): their details, edited in place one field at a time (PUT guests/{id}), their tags, their
 * leads, their timeline with a note, a new lead for them, and deleting them with what goes too (delete-impact).
 */
export function ContactPage() {
  const { t } = useTranslation()
  const { id: raw } = useParams()
  const id = Number(raw)
  const valid = Number.isInteger(id) && id > 0
  const guest = useQuery({
    queryKey: [...CONTACTS, 'one', id],
    queryFn: () => get<Guest>(`guests/${id}`),
    enabled: valid,
  })

  if (!valid) {
    return (
      <Page title={t('crm.contacts.contact', 'Contact')}>
        <BackLink />
        <Notice tone="danger">{t('crm.errors.not_found', 'This is no longer here. It may have been deleted.')}</Notice>
      </Page>
    )
  }

  const g = guest.data
  const name = g ? displayName(g) ?? t('crm.common.no_name', 'No name') : t('crm.contacts.contact', 'Contact')
  return (
    <Page title={name} line={g ? ([g.position_title, g.company].filter(Boolean).join(' · ') || t('crm.contacts.contact_line', 'A person you deal with')) : undefined}
      actions={g ? <HeaderActions guest={g} /> : undefined}>
      <BackLink />
      <QueryState loading={guest.isLoading} error={guest.error} onRetry={() => { void guest.refetch() }}>
        {g && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="min-w-0 space-y-5 lg:col-span-2">
              <DetailsCard guest={g} />
              <TimelineCard id={g.id} />
            </div>
            <div className="min-w-0 space-y-5">
              <TagsCard guest={g} />
              <LeadsCard id={g.id} />
            </div>
          </div>
        )}
      </QueryState>
    </Page>
  )
}

function BackLink() {
  const { t } = useTranslation()
  return (
    <Link to="/crm/contacts" className="inline-flex items-center gap-1.5 text-sm font-medium text-a-accent-text hover:underline">
      <ArrowLeft size={15} aria-hidden />{t('crm.contacts.back', 'All contacts')}
    </Link>
  )
}

/** A new lead for them, write or call them, and delete them (asked first, with what goes too). */
function HeaderActions({ guest }: { guest: Guest }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const mail = mailLink(guest.email)
  const call = phoneLink(guest.phone ?? guest.mobile)
  const impact = useQuery({
    queryKey: [...CONTACTS, 'impact', guest.id],
    queryFn: () => get<DeleteImpact>(`guests/${guest.id}/delete-impact`),
    enabled: deleting,
  })
  const remove = useMutation({
    mutationFn: () => send('delete', `guests/${guest.id}`),
    onSuccess: () => {
      qc.removeQueries({ queryKey: [...CONTACTS, 'one', guest.id] })
      refreshAfterContactChange(qc, { leadsToo: true })
      toast(t('crm.contacts.deleted', 'Contact deleted'))
      navigate('/crm/contacts')
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const name = displayName(guest) ?? t('crm.common.no_name', 'No name')
  const lines = impactLines(impact.data)
  const button = 'inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold'

  return (
    <>
      <Link to={newLeadFor(guest.id)} className={`${button} bg-a-accent text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep`}>
        <Target size={15} aria-hidden />{t('crm.contacts.new_lead', 'New lead for this contact')}
      </Link>
      {mail && <a href={mail} className={`${button} border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2`}><Mail size={15} aria-hidden />{t('crm.contacts.write', 'Email')}</a>}
      {call && <a href={call} className={`${button} border border-a-border bg-a-surface text-a-text hover:bg-a-surface-2`}><Phone size={15} aria-hidden />{t('crm.contacts.call', 'Call')}</a>}
      {boot.staff.can.delete_records && (
        <Button variant="secondary" onClick={() => setDeleting(true)} aria-label={t('crm.contacts.delete_named', 'Delete {{name}}', { name })}>
          <Trash2 size={15} aria-hidden />{t('crm.common.delete', 'Delete')}
        </Button>
      )}
      {deleting && (
        <Confirm title={t('crm.contacts.delete_title', 'Delete {{name}}?', { name })} confirm={t('crm.contacts.delete_confirm', 'Delete for good')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDeleting(false)}>
          <div className="space-y-2">
            <p>{t('crm.contacts.delete_line', 'The contact is deleted for good. This cannot be undone.')}</p>
            {impact.isLoading && <p role="status">{t('crm.contacts.delete_checking', 'Checking what goes with them…')}</p>}
            {impact.isError && <p>{t('crm.contacts.delete_unknown', 'We could not check what goes with them. Their leads and timeline go too.')}</p>}
            {lines.length > 0 && (
              <>
                <p className="font-medium text-a-text">{t('crm.contacts.delete_also', 'Deleted with them:')}</p>
                <ul className="list-disc space-y-0.5 pl-5">
                  {lines.map(line => (
                    <li key={line.key}>
                      {line.key === 'inquiries' ? t('crm.contacts.impact.inquiries', 'Leads: {{count}}', { count: line.count })
                        : line.key === 'activities' ? t('crm.contacts.impact.activities', 'Timeline entries: {{count}}', { count: line.count })
                        : t('crm.contacts.impact.reservations', 'Bookings: {{count}}', { count: line.count })}
                    </li>
                  ))}
                </ul>
              </>
            )}
            {impact.data && lines.length === 0 && <p>{t('crm.contacts.delete_nothing', 'Nothing else is linked to them.')}</p>}
          </div>
        </Confirm>
      )}
    </>
  )
}

type Kind = 'text' | 'email' | 'tel' | 'textarea' | 'select'
const FIELDS: { key: FieldKey; kind: Kind; list?: 'lifecycle' | 'importance' }[] = [
  { key: 'full_name', kind: 'text' },
  { key: 'email', kind: 'email' },
  { key: 'phone', kind: 'tel' },
  { key: 'mobile', kind: 'tel' },
  { key: 'company', kind: 'text' },
  { key: 'position_title', kind: 'text' },
  { key: 'lifecycle_status', kind: 'select', list: 'lifecycle' },
  { key: 'importance', kind: 'select', list: 'importance' },
  { key: 'lead_source', kind: 'text' },
  { key: 'owner_name', kind: 'text' },
  { key: 'country', kind: 'text' },
  { key: 'city', kind: 'text' },
  { key: 'address', kind: 'textarea' },
  { key: 'notes', kind: 'textarea' },
]

/** The fields' names, each written out so every word is found and translated. */
function useFieldLabels(): Record<FieldKey, string> {
  const { t } = useTranslation()
  return {
    full_name: t('crm.contacts.field.full_name', 'Name'),
    email: t('crm.contacts.field.email', 'Email'),
    phone: t('crm.contacts.field.phone', 'Phone'),
    mobile: t('crm.contacts.field.mobile', 'Mobile'),
    company: t('crm.contacts.field.company', 'Company'),
    position_title: t('crm.contacts.field.position_title', 'Job title'),
    lifecycle_status: t('crm.contacts.field.lifecycle_status', 'Lifecycle'),
    importance: t('crm.contacts.field.importance', 'Importance'),
    lead_source: t('crm.contacts.field.lead_source', 'Source'),
    owner_name: t('crm.contacts.field.owner_name', 'Owner'),
    country: t('crm.contacts.field.country', 'Country'),
    city: t('crm.contacts.field.city', 'City'),
    address: t('crm.contacts.field.address', 'Address'),
    notes: t('crm.contacts.field.notes', 'Notes'),
  }
}

/** The contact's details: each field shown, and changed in place with Save or Enter, Cancel or Escape. */
function DetailsCard({ guest }: { guest: Guest }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const lists = useContactLists()
  const labels = useFieldLabels()
  const [editing, setEditing] = useState<FieldKey | null>(null)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const save = useMutation({
    mutationFn: (body: Partial<Record<FieldKey, string>>) => send<Guest>('put', `guests/${guest.id}`, body),
    onSuccess: saved => {
      qc.setQueryData<Guest>([...CONTACTS, 'one', guest.id], old => (old ? { ...old, ...saved, tags: old.tags } : saved))
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'list'] })
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'facets'] })
      toast(t('crm.common.saved', 'Saved'))
      setEditing(null)
    },
    onError: error => setProblem(errorText(t, error)),
  })

  const value = (key: FieldKey): string => String((guest as unknown as Record<string, unknown>)[key] ?? '')
  const open = (key: FieldKey) => { setEditing(key); setDraft(value(key)); setProblem(null) }
  const close = () => { setEditing(null); setProblem(null) }
  const commit = (key: FieldKey) => {
    const outcome = fieldPatch(key, draft, value(key))
    if (outcome.kind === 'same') return close()
    if (outcome.kind === 'patch') return save.mutate(outcome.body)
    setProblem(outcome.kind === 'required' ? t('crm.contacts.form.required', 'Fill this in.')
      : outcome.kind === 'cannot_clear' ? t('crm.contacts.cannot_clear', 'A saved value cannot be emptied here. Write the new one instead.')
      : outcome.kind === 'bad_email' ? t('crm.contacts.form.bad_email', 'This does not look like an email address.')
      : t('crm.contacts.form.too_long_max', 'Keep it to {{max}} characters.', { max: outcome.max }))
  }

  return (
    <Card title={t('crm.contacts.details', 'Details')} icon={UserRound}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <StandingPills lifecycle={guest.lifecycle_status} importance={guest.importance} levels={lists.importance} />
        <span className="text-xs text-a-text-2">{t('crm.contacts.added_ago', 'Added {{when}}', { when: timeAgo(guest.created_at, i18n.language) })}</span>
      </div>
      <dl className="divide-y divide-a-border">
        {FIELDS.map(field => {
          const label = labels[field.key]
          const current = value(field.key)
          if (editing !== field.key) {
            return (
              <div key={field.key} className="flex items-start gap-3 py-2.5">
                <dt className="w-28 shrink-0 pt-0.5 text-xs text-a-text-2 sm:w-36">{label}</dt>
                <dd className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm text-a-text">
                  {current.trim() !== '' ? current : <span className="text-a-text-2">{t('crm.contacts.not_set', 'Not set')}</span>}
                </dd>
                <button type="button" onClick={() => open(field.key)} disabled={editing !== null && save.isPending}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent"
                  aria-label={t('crm.contacts.edit_field', 'Change {{field}}', { field: label })}>
                  <Pencil size={14} aria-hidden />
                </button>
              </div>
            )
          }
          const onKey = (e: KeyboardEvent<HTMLElement>) => {
            if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
            if (e.key === 'Enter' && field.kind !== 'textarea') { e.preventDefault(); commit(field.key) }
          }
          const options = field.list ? optionsWith(lists[field.list], current) : []
          return (
            <div key={field.key} className="py-2.5">
              <Field label={label}>
                {field.kind === 'textarea'
                  ? <TextArea rows={3} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoFocus />
                  : field.kind === 'select'
                    ? (
                      <Select value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoFocus>
                        {current === '' && <option value="">{t('crm.contacts.not_set', 'Not set')}</option>}
                        {options.map(v => <option key={v} value={v}>{v}</option>)}
                      </Select>
                    )
                    : <TextInput type={field.kind} value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={onKey} autoFocus autoComplete="off" />}
              </Field>
              {problem && <p role="alert" className="mt-1 text-xs text-a-danger">{problem}</p>}
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="secondary" size="sm" onClick={close} disabled={save.isPending}><X size={14} aria-hidden />{t('crm.common.cancel', 'Cancel')}</Button>
                <Button size="sm" onClick={() => commit(field.key)} loading={save.isPending}><Check size={14} aria-hidden />{t('crm.common.save', 'Save')}</Button>
              </div>
            </div>
          )
        })}
      </dl>
    </Card>
  )
}

/** The contact's tags: remove one, add one the organisation has, or make a new one and add it. */
function TagsCard({ guest }: { guest: Guest }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const all = useTags()
  const worn = guest.tags ?? []
  const offer = tagsToOffer(all.data ?? [], worn)
  const [pick, setPick] = useState('')
  const [name, setName] = useState('')
  const [nameProblem, setNameProblem] = useState<string | null>(null)

  const sync = useMutation({
    mutationFn: (ids: number[]) => send<GuestTag[]>('post', `guests/${guest.id}/tags`, { tag_ids: ids }),
    onSuccess: tags => {
      qc.setQueryData<Guest>([...CONTACTS, 'one', guest.id], old => (old ? { ...old, tags } : old))
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'list'] })
      setPick('')
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
    <Card title={t('crm.contacts.tags', 'Tags')} icon={Tag}>
      {worn.length === 0
        ? <p className="text-sm text-a-text-2">{t('crm.contacts.no_tags', 'No tags yet.')}</p>
        : (
          <ul className="flex flex-wrap gap-1.5">
            {worn.map(tag => (
              <li key={tag.id} className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 py-0.5 pl-2.5 pr-1 text-xs font-medium text-a-text">
                {tag.name}
                <button type="button" disabled={busy} onClick={() => sync.mutate(tagIdsWithout(worn, tag.id))}
                  className="grid h-6 w-6 place-items-center rounded-full text-a-text-2 hover:text-a-danger disabled:opacity-50"
                  aria-label={t('crm.contacts.remove_tag', 'Remove the tag {{name}}', { name: tag.name })}>
                  <X size={12} aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
      {offer.length > 0 && (
        <form className="mt-4 flex items-end gap-2" onSubmit={e => { e.preventDefault(); if (pick) sync.mutate(tagIdsWith(worn, Number(pick))) }}>
          <div className="min-w-0 flex-1">
            <Field label={t('crm.contacts.add_tag', 'Add a tag')}>
              <Select value={pick} onChange={e => setPick(e.target.value)}>
                <option value="">{t('crm.contacts.bulk_pick', 'Choose…')}</option>
                {offer.map(tag => <option key={tag.id} value={String(tag.id)}>{tag.name}</option>)}
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={!pick || busy}>{t('crm.common.add', 'Add')}</Button>
        </form>
      )}
      <form className="mt-3" onSubmit={e => { e.preventDefault(); makeTag() }}>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label={t('crm.contacts.new_tag', 'New tag')}>
              <TextInput value={name} onChange={e => { setName(e.target.value); setNameProblem(null) }} maxLength={80} autoComplete="off" />
            </Field>
          </div>
          <Button type="submit" variant="secondary" disabled={!name.trim() || busy} loading={create.isPending}><Plus size={14} aria-hidden />{t('crm.contacts.create_tag', 'Create')}</Button>
        </div>
        {nameProblem && <p role="alert" className="mt-1 text-xs text-a-danger">{nameProblem}</p>}
      </form>
    </Card>
  )
}

/** Their leads (GET guests/{id}/inquiries, newest first), each opening the lead. */
function LeadsCard({ id }: { id: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const leads = useQuery({ queryKey: [...CONTACTS, 'leads', id], queryFn: () => get<{ data: GuestLead[] }>(`guests/${id}/inquiries`) })
  const rows = leads.data?.data ?? []
  return (
    <Card title={t('crm.contacts.leads', 'Leads')} icon={Target} padded={false}
      action={<Link to={newLeadFor(id)} className="text-sm font-medium text-a-accent-text hover:underline">{t('crm.contacts.new_lead_short', 'New lead')}</Link>}>
      <div className={rows.length ? '' : 'p-4'}>
        <QueryState loading={leads.isLoading} error={leads.error} onRetry={() => { void leads.refetch() }} rows={2}>
          {rows.length === 0
            ? <EmptyState icon={Target} title={t('crm.contacts.no_leads', 'No leads yet')} line={t('crm.contacts.no_leads_line', 'A lead is something they asked for that you want to win.')} />
            : (
              <ul className="divide-y divide-a-border">
                {rows.map(lead => {
                  const state = leadState(lead.status)
                  return (
                    <li key={lead.id}>
                      <Link to={leadPath(lead.id)} className="flex items-start gap-3 px-4 py-3 hover:bg-a-surface-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-a-text">{lead.inquiry_type || t('crm.contacts.lead_number', 'Lead #{{id}}', { id: lead.id })}</span>
                          <span className="block truncate text-xs text-a-text-2">
                            {[timeAgo(lead.created_at, lang),
                              lead.next_task_due && !lead.next_task_completed ? t('crm.contacts.next_step', 'Next step {{day}}', { day: dayLabel(lead.next_task_due, lang) }) : null,
                            ].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          {lead.status && <Pill tone={LEAD_TONE[state]}>{lead.status}</Pill>}
                          {lead.total_value !== null && Number(lead.total_value) > 0 && <span className="mt-1 block text-xs text-a-text-2">{money(lead.total_value, boot.venue.currency, lang)}</span>}
                        </span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
        </QueryState>
      </div>
    </Card>
  )
}

/** Their timeline (GET guests/{id}/activities): what happened, newest first, and a line to add a note, call or email. */
function TimelineCard({ id }: { id: number }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const qc = useQueryClient()
  const toast = useToast()
  const [type, setType] = useState<ActivityType>('note')
  const [text, setText] = useState('')
  const timeline = useQuery({ queryKey: [...CONTACTS, 'timeline', id], queryFn: () => get<{ data: GuestActivity[] }>(`guests/${id}/activities`) })
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
  const rows = timeline.data?.data ?? []
  const labelOf = (kind: string) => t(`crm.contacts.${activityKey(kind)}`, ACTIVITY_FALLBACK[activityKey(kind)])

  return (
    <Card title={t('crm.contacts.timeline', 'Timeline')} icon={Activity}>
      <form className="space-y-2" onSubmit={e => { e.preventDefault(); if (body) add.mutate() }}>
        <Tabs label={t('crm.contacts.log_kind', 'What kind of touch')} value={type} onChange={setType}
          items={ACTIVITY_TYPES.map(key => ({ key, label: labelOf(key) }))} />
        <Field label={t('crm.contacts.log_what', 'What happened')}>
          <TextArea rows={2} value={text} onChange={e => setText(e.target.value)}
            placeholder={t('crm.contacts.log_placeholder', 'Talked about the offer; sending it on Tuesday.')}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && body) { e.preventDefault(); add.mutate() } }} />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={!body} loading={add.isPending}><Plus size={14} aria-hidden />{t('crm.contacts.log_add', 'Add to the timeline')}</Button>
        </div>
      </form>
      <div className="mt-4 border-t border-a-border pt-4">
        <QueryState loading={timeline.isLoading} error={timeline.error} onRetry={() => { void timeline.refetch() }} rows={3}>
          {rows.length === 0
            ? <p className="text-sm text-a-text-2">{t('crm.contacts.timeline_empty', 'Nothing on the timeline yet.')}</p>
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
                          {row.performed_by && <span className="text-xs text-a-text-2">{t('crm.contacts.by', 'by {{name}}', { name: row.performed_by })}</span>}
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
    </Card>
  )
}

