import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BadgePercent, Banknote, Building2, CalendarClock, Clock, CreditCard, FileText, Mail, Phone, ReceiptText, SlidersHorizontal, StickyNote, Target,
  Trash2, TrendingUp, UserRound, Users, type LucideIcon,
} from 'lucide-react'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, money, timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { InfoTip } from '../ui/InfoTip'
import { ActionMenu, type MenuItem } from '../ui/Menu'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { RecordFrame, RecordPanel, type RecordHostProps, type RecordTab } from '../ui/RecordPanel'
import { StatRow, StatTile } from '../ui/StatTile'
import { useToast } from '../ui/Toast'
import { LeadRow } from './contactParts'
import { CompanyStatus, ICON_LINK } from './parts'
import {
  COMPANY_STATUSES, companyFieldPatch, companyGroupsFor, companyStatusKey, companyValue, displayName, mailLink, optionsWith, phoneLink,
  type CompanyFieldKey,
} from './contactsLogic'
import { CustomFieldsCard } from './CustomFieldsCard'
import { InlineFields, type InlineCheck, type InlineGroup } from './InlineFields'
import { CONTACTS, useCompany, useContactLists, useCustomFields } from './queries'
import { companyTab, filledCount, type CompanyTab } from './recordLogic'
import type { CompanyDetail, Guest, Paginated } from './types'

const STATUS_FALLBACK: Record<string, string> = { Active: 'Active', Pending: 'Pending', Expired: 'Expired', Suspended: 'Suspended' }
const GROUP_ICON: Record<string, LucideIcon> = { main: Building2, reach: UserRound, terms: FileText, billing: ReceiptText, notes: StickyNote }

/** The people whose Company field names this company (GET guests?company=, the full admin's "Customers at"). */
function usePeopleAt(name: string | undefined) {
  const query = { company: name ?? '', sort: 'full_name', dir: 'asc', per_page: 50 }
  return useQuery({
    queryKey: [...CONTACTS, 'list', 'at', query],
    queryFn: () => get<Paginated<Guest>>(`guests${params(query)}`),
    enabled: Boolean(name),
  })
}

/** Round 5: a company in a panel over the page it was opened on (`?company=3`), previous and next through its list. */
export function CompanyRecordPanel({ id, tab, onTab, onClose, onPrev, onNext }: RecordHostProps) {
  const { t } = useTranslation()
  const company = useCompany(id)
  const name = company.data?.company_name ?? t('crm.contacts.company_title', 'Company')
  return (
    <RecordPanel label={name} onClose={onClose} onPrev={onPrev} onNext={onNext}>
      {(tools, titleId) => <CompanyFrame id={id} tab={companyTab(tab)} onTab={onTab} tools={tools} titleId={titleId} onGone={onClose} />}
    </RecordPanel>
  )
}

/**
 * A company as one frame: its name, state and main contact; write or call them; and its parts as tabs — Overview (its
 * vitals and every field the full admin keeps, changed where they stand; a hotel's rate and room nights only for a
 * hotel), People (the contacts who work there), Leads, and the organisation's own Fields.
 */
export function CompanyFrame({ id, tab, onTab, tools, titleId, onGone }: {
  id: number
  tab: CompanyTab
  onTab: (tab: string) => void
  tools?: ReactNode
  titleId?: string
  onGone: () => void
}) {
  const { t } = useTranslation()
  const detail = useCompany(id)
  const custom = useCustomFields('corporate_account')
  const c = detail.data
  const people = usePeopleAt(c?.company_name)
  const fields = custom.data ?? []
  const tabs: RecordTab[] = [
    { key: 'overview', label: t('crm.record.overview', 'Overview'), icon: Building2 },
    { key: 'people', label: t('crm.contacts.tabs.people', 'People'), icon: Users, count: people.data?.total },
    { key: 'leads', label: t('crm.contacts.leads', 'Leads'), icon: Target, count: c?.inquiries_count ?? c?.recent_inquiries?.length },
    { key: 'fields', label: t('crm.contacts.tab_fields', 'Fields'), icon: SlidersHorizontal, count: c ? filledCount(fields, c.custom_data) : undefined },
  ]
  const choose = (key: string) => onTab(companyTab(key))
  const prefix = 'crm-company'

  if (!c) {
    return (
      <RecordFrame idPrefix={prefix} titleId={titleId} title={t('crm.contacts.company_title', 'Company')} tools={tools} tabs={tabs.slice(0, 1)} tab="overview" onTab={choose}>
        <QueryState loading={detail.isLoading} error={detail.error} onRetry={() => { void detail.refetch() }}>
          <Notice tone="danger">{t('crm.errors.not_found', 'This is no longer here. It may have been deleted.')}</Notice>
        </QueryState>
      </RecordFrame>
    )
  }

  return (
    <RecordFrame idPrefix={prefix} titleId={titleId} title={c.company_name} tools={tools}
      avatar={<span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-a-st-progress/12 text-a-st-progress"><Building2 size={22} /></span>}
      badges={<CompanyBadges company={c} />}
      subtitle={[c.industry, c.contact_person, c.contact_email].filter(Boolean).join(' · ') || undefined}
      actions={<CompanyActions company={c} onGone={onGone} />}
      tabs={tabs} tab={tab} onTab={choose}>
      {tab === 'overview' && <CompanyOverview company={c} />}
      {tab === 'people' && <CompanyPeople company={c} rows={people.data?.data ?? []} total={people.data?.total ?? 0} loading={people.isLoading} error={people.error} onRetry={() => { void people.refetch() }} />}
      {tab === 'leads' && <CompanyLeads company={c} />}
      {tab === 'fields' && (
        <QueryState loading={custom.isLoading} error={custom.error} onRetry={() => { void custom.refetch() }} rows={2}>
          <CompanyCustomFields company={c} />
        </QueryState>
      )}
    </RecordFrame>
  )
}

function CompanyBadges({ company }: { company: CompanyDetail }) {
  const { t, i18n } = useTranslation()
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <CompanyStatus status={company.status} />
      {company.ltv?.renewal_soon && company.contract_end && (
        <Pill tone="pending"><CalendarClock size={12} aria-hidden />{t('crm.contacts.renewal_soon', 'Contract ends {{day}}', { day: dayLabel(company.contract_end, i18n.language) })}</Pill>
      )}
    </span>
  )
}

/** Write or call the main contact; see the people in the list, or delete the company, from the … menu. */
function CompanyActions({ company, onGone }: { company: CompanyDetail; onGone: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const mail = mailLink(company.contact_email) ?? mailLink(company.billing_email)
  const call = phoneLink(company.contact_phone)
  const remove = useMutation({
    mutationFn: () => send('delete', `corporate-accounts/${company.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'companies'] })
      qc.removeQueries({ queryKey: [...CONTACTS, 'company', company.id] })
      toast(t('crm.contacts.company_deleted', 'Company deleted'))
      setDeleting(false)
      onGone()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const items: (MenuItem | 'divider')[] = [
    { key: 'people', icon: Users, label: t('crm.contacts.people_in_list', 'Show in People'), onSelect: () => navigate(`/crm/contacts?co=${encodeURIComponent(company.company_name)}`) },
  ]
  if (boot.staff.can.delete_records) items.push('divider', { key: 'delete', icon: Trash2, danger: true, label: t('crm.common.delete', 'Delete'), onSelect: () => setDeleting(true) })
  return (
    <>
      {mail && <IconButton icon={Mail} href={mail} label={t('crm.contacts.write', 'Email')} className="border border-a-border" />}
      {call && <IconButton icon={Phone} href={call} label={t('crm.contacts.call', 'Call')} className="border border-a-border" />}
      <ActionMenu label={t('crm.contacts.more_named', 'More for {{name}}', { name: company.company_name })} items={items} className={ICON_LINK} align="left" />
      {deleting && (
        <Confirm title={t('crm.contacts.company_delete_title', 'Delete {{name}}?', { name: company.company_name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDeleting(false)}>
          {t('crm.contacts.company_delete_line', 'The company is deleted for good. Its leads and people stay, without the company.')}
        </Confirm>
      )}
    </>
  )
}

/** The fields' names, each written out so every word is found and translated. */
function useCompanyLabels(): Record<CompanyFieldKey, string> {
  const { t } = useTranslation()
  return {
    company_name: t('crm.contacts.company.company_name', 'Company name'),
    industry: t('crm.contacts.company.industry', 'Industry'),
    status: t('crm.contacts.company.status', 'Status'),
    account_manager: t('crm.contacts.company.account_manager', 'Account manager'),
    contact_person: t('crm.contacts.company.contact_person', 'Main contact'),
    contact_email: t('crm.contacts.company.contact_email', 'Contact email'),
    contact_phone: t('crm.contacts.company.contact_phone', 'Contact phone'),
    payment_terms: t('crm.contacts.company.payment_terms', 'Payment terms'),
    credit_limit: t('crm.contacts.company.credit_limit', 'Credit limit'),
    discount_percentage: t('crm.contacts.company.discount_percentage', 'Discount %'),
    contract_start: t('crm.contacts.company.contract_start', 'Contract from'),
    contract_end: t('crm.contacts.company.contract_end', 'Contract until'),
    negotiated_rate: t('crm.contacts.company.negotiated_rate', 'Negotiated rate'),
    rate_type: t('crm.contacts.company.rate_type', 'Rate type'),
    annual_room_nights_target: t('crm.contacts.company.annual_room_nights_target', 'Room nights a year'),
    billing_email: t('crm.contacts.company.billing_email', 'Billing email'),
    tax_id: t('crm.contacts.company.tax_id', 'Tax ID'),
    billing_address: t('crm.contacts.company.billing_address', 'Billing address'),
    notes: t('crm.contacts.field.notes', 'Notes'),
  }
}

/** The company's vitals (only those with something to say), then its fields in groups, each changed where it stands. */
function CompanyOverview({ company }: { company: CompanyDetail }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const qc = useQueryClient()
  const toast = useToast()
  const lists = useContactLists()
  const labels = useCompanyLabels()
  const hotel = boot.organization.industry === 'hotel'
  const currency = boot.venue.currency
  const titles: Record<string, string> = {
    main: t('crm.contacts.company_group.main', 'Company'),
    reach: t('crm.contacts.company_group.reach', 'Main contact'),
    terms: t('crm.contacts.company_group.terms', 'Terms'),
    billing: t('crm.contacts.company_group.billing', 'Billing'),
    notes: t('crm.contacts.group.notes', 'Notes'),
  }
  const statusLabel = (v: string) => { const key = companyStatusKey(v); return key ? t(`crm.contacts.${key}`, STATUS_FALLBACK[v] ?? v) : v }
  const value = (key: CompanyFieldKey) => companyValue(company as unknown as Record<CompanyFieldKey, unknown>, key)
  const display = (key: CompanyFieldKey): ReactNode => {
    const v = value(key)
    if (v === '') return undefined
    if (key === 'credit_limit' || key === 'negotiated_rate') return money(v, currency, lang)
    if (key === 'discount_percentage') return `${v} %`
    if (key === 'contract_start' || key === 'contract_end') return dayLabel(v, lang) || v
    if (key === 'status') return statusLabel(v)
    return undefined
  }
  const groups: InlineGroup[] = companyGroupsFor(hotel).map(group => ({
    key: group.key, title: titles[group.key], icon: GROUP_ICON[group.key],
    fields: group.fields.map(def => ({
      key: def.key, label: labels[def.key], kind: def.kind, value: value(def.key), display: display(def.key),
      options: def.list === 'statuses' ? optionsWith([...COMPANY_STATUSES], value(def.key)) : def.list === 'rateTypes' ? optionsWith(lists.rateTypes, value(def.key)) : undefined,
      optionLabel: def.list === 'statuses' ? statusLabel : undefined,
      suggestions: def.suggest === 'industries' ? lists.industries : def.suggest === 'managers' ? lists.managers : undefined,
      clearable: def.key !== 'company_name' && def.key !== 'status',
      min: def.min, max: def.max, whole: def.whole,
    })),
  }))
  const check = (key: string, draft: string): InlineCheck => {
    const outcome = companyFieldPatch(key as CompanyFieldKey, draft, value(key as CompanyFieldKey))
    switch (outcome.kind) {
      case 'same': return { kind: 'same' }
      case 'patch': return { kind: 'send', body: outcome.body }
      case 'required': return { kind: 'error', text: t('crm.contacts.form.required', 'Fill this in.') }
      case 'bad_email': return { kind: 'error', text: t('crm.contacts.form.bad_email', 'This does not look like an email address.') }
      case 'too_long': return { kind: 'error', text: t('crm.contacts.form.too_long_max', 'Keep it to {{max}} characters.', { max: outcome.max }) }
      case 'bad_day': return { kind: 'error', text: t('crm.contacts.form.bad_day', 'Choose a day.') }
      case 'bad_number': return {
        kind: 'error',
        text: outcome.max !== null
          ? t('crm.contacts.form.number_between', 'Write a number from {{min}} to {{max}}.', { min: outcome.min, max: outcome.max })
          : outcome.whole ? t('crm.contacts.form.bad_whole', 'Write a whole number of 0 or more.') : t('crm.contacts.form.bad_number', 'Write a number of 0 or more.'),
      }
    }
  }
  const save = async (body: Record<string, unknown>) => {
    const saved = await send<CompanyDetail>('put', `corporate-accounts/${company.id}`, body)
    qc.setQueryData<CompanyDetail>([...CONTACTS, 'company', company.id], old => (old ? { ...old, ...body, ...saved, ltv: old.ltv, recent_inquiries: old.recent_inquiries, inquiries_count: old.inquiries_count } : saved))
    void qc.invalidateQueries({ queryKey: [...CONTACTS, 'companies'] })
    toast(Object.values(body).some(v => v === null) ? t('crm.contacts.cleared', 'Cleared') : t('crm.common.saved', 'Saved'))
  }

  const ltv = company.ltv
  const tiles: ReactNode[] = []
  if (ltv && (ltv.open_pipeline_count > 0 || ltv.open_pipeline_value > 0)) {
    tiles.push(<StatTile key="pipeline" icon={TrendingUp} tone="progress" label={t('crm.contacts.open_pipeline', 'Open pipeline')} value={money(ltv.open_pipeline_value, currency, lang)} hint={t('crm.contacts.open_leads', 'Open leads: {{count}}', { count: ltv.open_pipeline_count })} />)
  }
  if (ltv?.last_contact_at) {
    tiles.push(<StatTile key="contact" icon={Clock} label={t('crm.contacts.last_contact', 'Last contact')} value={<span className="text-lg" title={dateTime(ltv.last_contact_at, lang, boot.venue.timezone)}>{timeAgo(ltv.last_contact_at, lang)}</span>} />)
  }
  if (hotel && ltv && (ltv.confirmed_revenue ?? 0) > 0) {
    tiles.push(<StatTile key="revenue" icon={Banknote} tone="success" label={t('crm.contacts.lifetime_revenue', 'Lifetime revenue')} value={money(ltv.confirmed_revenue ?? 0, currency, lang)} />)
  }
  if (hotel && ltv && ltv.credit_pct !== null && ltv.credit_pct !== undefined) {
    tiles.push(<StatTile key="credit" icon={CreditCard} tone={ltv.credit_pct >= 90 ? 'danger' : ltv.credit_pct >= 75 ? 'pending' : 'neutral'} label={t('crm.contacts.credit_used', 'Credit used')} value={`${ltv.credit_pct} %`} hint={money(ltv.outstanding ?? 0, currency, lang)} />)
  }
  if (hotel && company.discount_percentage !== null && company.discount_percentage !== undefined && Number(company.discount_percentage) > 0 && tiles.length < 4) {
    tiles.push(<StatTile key="discount" icon={BadgePercent} label={t('crm.contacts.company.discount_percentage', 'Discount %')} value={`${Number(company.discount_percentage)} %`} />)
  }

  return (
    <div className="space-y-4">
      {tiles.length > 0 && <StatRow count={tiles.length}>{tiles}</StatRow>}
      <InlineFields idPrefix="crm-company-field" groups={groups} check={check} save={save} />
    </div>
  )
}

/** The contacts whose Company field names this company, each opening in its panel. */
function CompanyPeople({ company, rows, total, loading, error, onRetry }: { company: CompanyDetail; rows: Guest[]; total: number; loading: boolean; error: unknown; onRetry: () => void }) {
  const { t } = useTranslation()
  const records = useRecords()
  return (
    <QueryState loading={loading} error={error} onRetry={onRetry} rows={3}>
      {rows.length === 0
        ? <EmptyState icon={Users} title={t('crm.contacts.company_no_people', 'Nobody here yet')} line={t('crm.contacts.company_people_line', 'A contact whose Company is {{name}} shows here.', { name: company.company_name })} />
        : (
          <div className="space-y-2">
            <p className="flex items-center gap-1.5 text-xs text-a-text-2">
              {t('crm.common.total', '{{count}} in all', { count: total })}
              <InfoTip text={t('crm.contacts.company_people_line', 'A contact whose Company is {{name}} shows here.', { name: company.company_name })} />
            </p>
            <ul className="-mx-2 divide-y divide-a-border/60">
              {rows.map(person => {
                const name = displayName(person) ?? t('crm.common.no_name', 'No name')
                return (
                  <li key={person.id}>
                    <Link to={records.href('contact', person.id)} className="flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
                      <Avatar name={name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-a-text">{name}</span>
                        <span className="block truncate text-xs text-a-text-2">{[person.position_title, person.email ?? person.phone].filter(Boolean).join(' · ') || '—'}</span>
                      </span>
                      {person.lifecycle_status && <Pill>{person.lifecycle_status}</Pill>}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        )}
    </QueryState>
  )
}

/** The company's latest leads (the server sends the newest ten), each opening in its panel. */
function CompanyLeads({ company }: { company: CompanyDetail }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const rows = company.recent_inquiries ?? []
  const total = company.inquiries_count ?? rows.length
  if (rows.length === 0) return <EmptyState icon={Target} title={t('crm.contacts.no_leads', 'No leads yet')} />
  return (
    <div className="space-y-2">
      {total > rows.length && <p className="text-xs text-a-text-2">{t('crm.contacts.latest_of', 'The latest {{shown}} of {{count}}', { shown: rows.length, count: total })}</p>}
      <ul className="-mx-2 divide-y divide-a-border/60">
        {rows.map(lead => (
          <LeadRow key={lead.id} id={lead.id} status={lead.status} value={lead.total_value}
            title={lead.guest_name ?? t('crm.common.no_name', 'No name')}
            sub={[lead.inquiry_type, timeAgo(lead.created_at, lang)].filter(Boolean).join(' · ')} />
        ))}
      </ul>
    </div>
  )
}

/** The organisation's own company fields, saved with PUT corporate-accounts/{id} `custom_data` as the full admin does. */
function CompanyCustomFields({ company }: { company: CompanyDetail }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const boot = useBoot()
  const custom = useCustomFields('corporate_account')
  const save = async (customData: Record<string, unknown>) => {
    const saved = await send<CompanyDetail>('put', `corporate-accounts/${company.id}`, { custom_data: customData })
    qc.setQueryData<CompanyDetail>([...CONTACTS, 'company', company.id], old => (old ? { ...old, custom_data: saved.custom_data ?? null } : saved))
    toast(t('crm.common.saved', 'Saved'))
  }
  return <CustomFieldsCard idPrefix="crm-company-custom" fields={custom.data ?? []} values={company.custom_data} save={save} canSetUp={boot.staff.can.manage_pipelines} />
}
