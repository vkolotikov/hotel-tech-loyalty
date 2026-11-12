import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Activity, Briefcase, Flag, GitMerge, Mail, MailX, MapPin, MessageCircle, Phone, SlidersHorizontal, StickyNote, Target, Trash2, UserRound,
  type LucideIcon,
} from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { QueryState } from '../ui/QueryState'
import { RecordFrame, RecordPanel, type RecordHostProps, type RecordTab } from '../ui/RecordPanel'
import { useToast } from '../ui/Toast'
import { RecordEmails } from '../mail/RecordEmails'
import { ContactActivity, ContactDelete, ContactLeads, TagBadges } from './contactParts'
import {
  CONTACT_GROUPS, KEPT_FIELDS, contactSubtitle, displayName, fieldPatch, mailLink, optionsWith, pairsWith, phoneLink, whatsappLink,
  type FieldKey,
} from './contactsLogic'
import { CustomFieldsCard } from './CustomFieldsCard'
import { InlineFields, type InlineCheck, type InlineGroup } from './InlineFields'
import { MergeConfirm } from './MergeConfirm'
import { ICON_LINK, PRIMARY_LINK, StandingPills } from './parts'
import { CONTACTS, useContact, useContactLeads, useContactLists, useCustomFields, useDuplicates, useFacets, useTimeline } from './queries'
import { contactPageHref, contactTab, filledCount, type ContactTab } from './recordLogic'
import type { DuplicatePair, Guest } from './types'

const GROUP_ICON: Record<(typeof CONTACT_GROUPS)[number]['key'], LucideIcon> = { reach: UserRound, work: Briefcase, standing: Flag, place: MapPin, notes: StickyNote }

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
    guest_type: t('crm.contacts.field.guest_type', 'Type'),
    vip_level: t('crm.contacts.field.vip_level', 'VIP level'),
    lead_source: t('crm.contacts.field.lead_source', 'Source'),
    owner_name: t('crm.contacts.field.owner_name', 'Owner'),
    country: t('crm.contacts.field.country', 'Country'),
    city: t('crm.contacts.field.city', 'City'),
    nationality: t('crm.contacts.field.nationality', 'Nationality'),
    preferred_language: t('crm.contacts.field.preferred_language', 'Language'),
    address: t('crm.contacts.field.address', 'Address'),
    notes: t('crm.contacts.field.notes', 'Notes'),
  }
}

/**
 * Round 5 (owner 2026-11-12, "opening tabs, slides or popups"): a contact in a panel over the page it was opened on
 * (`?contact=12`), with previous and next through the list it came from, and their own page one press away.
 */
export function ContactRecordPanel({ id, tab, onTab, onClose, onPrev, onNext }: RecordHostProps) {
  const { t } = useTranslation()
  const records = useRecords()
  const guest = useContact(id)
  const name = guest.data ? displayName(guest.data) ?? t('crm.common.no_name', 'No name') : t('crm.contacts.contact', 'Contact')
  return (
    <RecordPanel label={name} onClose={onClose} onPrev={onPrev} onNext={onNext} fullHref={contactPageHref(id, tab)}>
      {(tools, titleId) => (
        <ContactFrame id={id} tab={contactTab(tab)} onTab={onTab} tools={tools} titleId={titleId}
          onGone={onClose} onOpenContact={other => records.open('contact', other)} />
      )}
    </RecordPanel>
  )
}

/**
 * A contact as one frame (the panel and `/crm/contacts/:id` draw the same): who they are, their standing and tags
 * (changed in place), how to reach them, a new lead for them, and their parts as tabs — Overview (the details,
 * changed where they stand), Leads, Activity (the timeline), Emails, and the organisation's own Fields.
 */
export function ContactFrame({ id, tab, onTab, tools, titleId, onGone, onOpenContact, idPrefix = 'crm-contact' }: {
  id: number
  tab: ContactTab
  onTab: (tab: ContactTab) => void
  tools?: ReactNode
  titleId?: string
  /** After a delete, or a merge that removed this contact. */
  onGone: () => void
  /** Open another contact (the one a merge kept). */
  onOpenContact: (id: number) => void
  idPrefix?: string
}) {
  const { t } = useTranslation()
  const guest = useContact(id)
  const leads = useContactLeads(id)
  const timeline = useTimeline(id)
  const custom = useCustomFields('guest')
  const g = guest.data
  const leadRows = leads.data?.data ?? []
  const timelineRows = timeline.data?.data ?? []
  const fields = custom.data ?? []

  const tabs: RecordTab[] = [
    { key: 'overview', label: t('crm.record.overview', 'Overview'), icon: UserRound },
    { key: 'leads', label: t('crm.contacts.leads', 'Leads'), icon: Target, count: leadRows.length },
    { key: 'activity', label: t('crm.contacts.tab_activity', 'Activity'), icon: Activity, count: timelineRows.length },
    { key: 'emails', label: t('crm.contacts.tab_emails', 'Emails'), icon: Mail },
    { key: 'fields', label: t('crm.contacts.tab_fields', 'Fields'), icon: SlidersHorizontal, count: g ? filledCount(fields, g.custom_data) : undefined },
  ]
  const choose = (key: string) => onTab(contactTab(key))

  if (!g) {
    return (
      <RecordFrame idPrefix={idPrefix} titleId={titleId} title={t('crm.contacts.contact', 'Contact')} tools={tools} tabs={tabs.slice(0, 1)} tab="overview" onTab={choose}>
        <QueryState loading={guest.isLoading} error={guest.error} onRetry={() => { void guest.refetch() }}>
          <Notice tone="danger">{t('crm.errors.not_found', 'This is no longer here. It may have been deleted.')}</Notice>
        </QueryState>
      </RecordFrame>
    )
  }

  const name = displayName(g) ?? t('crm.common.no_name', 'No name')
  return (
    <RecordFrame idPrefix={idPrefix} titleId={titleId} title={name} tools={tools}
      avatar={<Avatar name={name} size="lg" tone="accent" />}
      badges={<ContactBadges guest={g} />}
      subtitle={contactSubtitle(g) || undefined}
      actions={<ContactActions guest={g} onGone={onGone} onOpenContact={onOpenContact} />}
      tabs={tabs} tab={tab} onTab={choose}>
      {tab === 'overview' && <ContactOverview guest={g} idPrefix={idPrefix} />}
      {tab === 'leads' && <ContactLeads id={id} rows={leadRows} loading={leads.isLoading} error={leads.error} onRetry={() => { void leads.refetch() }} />}
      {tab === 'activity' && <ContactActivity id={id} rows={timelineRows} loading={timeline.isLoading} error={timeline.error} onRetry={() => { void timeline.refetch() }} />}
      {tab === 'emails' && (
        // The email history draws nothing where no mailbox serves it; then this tab says so instead of standing empty.
        <>
          <div className="peer/mail"><RecordEmails resource="guests" id={id} /></div>
          <div className="hidden peer-empty/mail:block"><EmptyState icon={MailX} title={t('crm.contacts.no_email_history', 'No email history here')} /></div>
        </>
      )}
      {tab === 'fields' && (
        <QueryState loading={custom.isLoading} error={custom.error} onRetry={() => { void custom.refetch() }} rows={2}>
          <ContactCustomFields guest={g} idPrefix={idPrefix} />
        </QueryState>
      )}
    </RecordFrame>
  )
}

/** Beside the name: the lifecycle, the importance when above the usual, and the tags. */
function ContactBadges({ guest }: { guest: Guest }) {
  const lists = useContactLists()
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <StandingPills lifecycle={guest.lifecycle_status} importance={guest.importance} levels={lists.importance} />
      <TagBadges guest={guest} />
    </span>
  )
}

/** A new lead for them, write, call or WhatsApp them; merge a look-alike or delete them from the … menu. */
function ContactActions({ guest, onGone, onOpenContact }: { guest: Guest; onGone: () => void; onOpenContact: (id: number) => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const duplicates = useDuplicates()
  const records = useRecords()
  const [deleting, setDeleting] = useState(false)
  const [merging, setMerging] = useState<DuplicatePair | null>(null)
  const mail = mailLink(guest.email)
  const call = phoneLink(guest.phone ?? guest.mobile)
  const chat = whatsappLink(guest.mobile ?? guest.phone)
  const name = displayName(guest) ?? t('crm.common.no_name', 'No name')
  const lookAlikes = pairsWith(duplicates.data?.pairs ?? [], guest.id)
  const items: (MenuItem | 'divider')[] = lookAlikes.map(({ pair, other }) => ({
    key: `merge-${other.id}`, icon: GitMerge, onSelect: () => setMerging(pair),
    label: t('crm.contacts.merge_with', 'Merge with {{name}}', { name: displayName(other) ?? `#${other.id}` }),
  }))
  if (boot.staff.can.delete_records) {
    if (items.length) items.push('divider')
    items.push({ key: 'delete', icon: Trash2, danger: true, onSelect: () => setDeleting(true), label: t('crm.common.delete', 'Delete') })
  }
  return (
    <>
      <Link to={records.createHref('lead', { guest: guest.id })} className={PRIMARY_LINK}><Target size={15} aria-hidden />{t('crm.contacts.new_lead_short', 'New lead')}</Link>
      {mail && <IconButton icon={Mail} href={mail} label={t('crm.contacts.write', 'Email')} className="border border-a-border" />}
      {call && <IconButton icon={Phone} href={call} label={t('crm.contacts.call', 'Call')} className="border border-a-border" />}
      {chat && (
        <a href={chat} target="_blank" rel="noopener noreferrer" aria-label={t('crm.contacts.whatsapp', 'WhatsApp')} title={t('crm.contacts.whatsapp', 'WhatsApp')} className={ICON_LINK}>
          <MessageCircle size={17} aria-hidden />
        </a>
      )}
      {items.length > 0 && <ActionMenu label={t('crm.contacts.more_named', 'More for {{name}}', { name })} items={items} className={ICON_LINK} align="left" />}
      {deleting && <ContactDelete guest={guest} onClose={() => setDeleting(false)} onDeleted={() => { setDeleting(false); onGone() }} />}
      {merging && (
        <MergeConfirm pair={merging} onClose={() => setMerging(null)}
          onMerged={kept => { if (kept !== guest.id) onOpenContact(kept) }} />
      )}
    </>
  )
}

/** The details in groups, each changed where it stands; when they were added and last touched. */
function ContactOverview({ guest, idPrefix }: { guest: Guest; idPrefix: string }) {
  const { t, i18n } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const lists = useContactLists()
  const facets = useFacets()
  const labels = useFieldLabels()
  const titles: Record<(typeof CONTACT_GROUPS)[number]['key'], string> = {
    reach: t('crm.contacts.group.reach', 'Contact'),
    work: t('crm.contacts.group.work', 'Work'),
    standing: t('crm.contacts.group.standing', 'Standing'),
    place: t('crm.contacts.group.place', 'Place'),
    notes: t('crm.contacts.group.notes', 'Notes'),
  }
  const value = (key: FieldKey): string => String((guest as unknown as Record<string, unknown>)[key] ?? '')
  const suggest = { sources: facets.data?.lead_source, countries: facets.data?.country, nationalities: facets.data?.nationality, owners: facets.data?.owner_name }
  const groups: InlineGroup[] = CONTACT_GROUPS.map(group => ({
    key: group.key, title: titles[group.key], icon: GROUP_ICON[group.key],
    fields: group.fields.map(def => ({
      key: def.key, label: labels[def.key], kind: def.kind, value: value(def.key),
      options: def.list ? optionsWith(lists[def.list], value(def.key)) : undefined,
      suggestions: def.suggest ? suggest[def.suggest] ?? [] : undefined,
      clearable: !KEPT_FIELDS.includes(def.key),
    })),
  }))
  const check = (key: string, draft: string): InlineCheck => {
    const outcome = fieldPatch(key as FieldKey, draft, value(key as FieldKey))
    if (outcome.kind === 'same') return { kind: 'same' }
    if (outcome.kind === 'patch') return { kind: 'send', body: outcome.body }
    return {
      kind: 'error',
      text: outcome.kind === 'required' ? t('crm.contacts.form.required', 'Fill this in.')
        : outcome.kind === 'bad_email' ? t('crm.contacts.form.bad_email', 'This does not look like an email address.')
        : t('crm.contacts.form.too_long_max', 'Keep it to {{max}} characters.', { max: outcome.max }),
    }
  }
  const save = async (body: Record<string, unknown>) => {
    const saved = await send<Guest>('put', `guests/${guest.id}`, body)
    qc.setQueryData<Guest>([...CONTACTS, 'one', guest.id], old => (old ? { ...old, ...body, ...saved, tags: old.tags } : saved))
    void qc.invalidateQueries({ queryKey: [...CONTACTS, 'list'] })
    void qc.invalidateQueries({ queryKey: [...CONTACTS, 'facets'] })
    toast(Object.values(body).some(v => v === null) ? t('crm.contacts.cleared', 'Cleared') : t('crm.common.saved', 'Saved'))
  }
  const lang = i18n.language
  return (
    <div className="space-y-4">
      <InlineFields idPrefix={`${idPrefix}-field`} groups={groups} check={check} save={save} />
      <p className="flex flex-wrap gap-x-3 gap-y-1 border-t border-a-border pt-3 text-xs text-a-text-2">
        {guest.created_at && <span>{t('crm.contacts.added_ago', 'Added {{when}}', { when: timeAgo(guest.created_at, lang) })}</span>}
        {guest.last_activity_at && <span>{t('crm.contacts.touched_ago', 'Last touch {{when}}', { when: timeAgo(guest.last_activity_at, lang) })}</span>}
      </p>
    </div>
  )
}

/** The organisation's own contact fields, saved with PUT guests/{id} `custom_data` as the full admin's guest page does. */
function ContactCustomFields({ guest, idPrefix }: { guest: Guest; idPrefix: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const boot = useBoot()
  const custom = useCustomFields('guest')
  const save = async (customData: Record<string, unknown>) => {
    const saved = await send<Guest>('put', `guests/${guest.id}`, { custom_data: customData })
    qc.setQueryData<Guest>([...CONTACTS, 'one', guest.id], old => (old ? { ...old, custom_data: saved.custom_data ?? null } : saved))
    toast(t('crm.common.saved', 'Saved'))
  }
  return <CustomFieldsCard idPrefix={`${idPrefix}-custom`} fields={custom.data ?? []} values={guest.custom_data} save={save} canSetUp={boot.staff.can.manage_pipelines} />
}
