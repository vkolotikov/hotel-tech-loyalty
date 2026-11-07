import { useCallback, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dateTime, dayLabel, money, timeAgo } from '../lib/format'
import { leadPath } from '../lib/links'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Select } from '../ui/inputs'
import { Pager } from '../ui/Pager'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { SidePanel } from '../ui/SidePanel'
import { useToast } from '../ui/Toast'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { COMPANY_STATUSES, COMPANY_TONE, LEAD_TONE, PER_PAGE, arg, companyStatusKey, leadState, pageFrom, withParam } from './contactsLogic'
import { CompanyFormPanel } from './CompanyForm'
import { Fact } from './parts'
import { CONTACTS } from './queries'
import { SearchBox } from './SearchBox'
import type { Company, CompanyDetail, Paginated } from './types'

const STATUS_FALLBACK: Record<string, string> = { Active: 'Active', Pending: 'Pending', Expired: 'Expired', Suspended: 'Suspended' }

/** A company's state in its tone, in the person's language when we know the word. */
function CompanyStatus({ status }: { status: string | null }) {
  const { t } = useTranslation()
  if (!status) return null
  const key = companyStatusKey(status)
  return <Pill tone={COMPANY_TONE[status] ?? 'neutral'}>{key ? t(`crm.contacts.${key}`, STATUS_FALLBACK[status] ?? status) : status}</Pill>
}

/** The companies the venue deals with (corporate accounts): search, status, open one, add, change, delete. */
export function CompaniesTab({ onAdd }: { onAdd: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const [search, setSearch] = useSearchParams()
  const q = arg(search, 'cq')
  const status = (COMPANY_STATUSES as readonly string[]).includes(arg(search, 'cstatus')) ? arg(search, 'cstatus') : ''
  const page = pageFrom(search, 'cpage')
  const query = { search: q.trim(), status, page, per_page: PER_PAGE, sort: 'company_name', dir: 'asc' }
  const [openId, setOpenId] = useState<number | null>(null)

  const list = useQuery({
    queryKey: [...CONTACTS, 'companies', query],
    queryFn: () => get<Paginated<Company>>(`corporate-accounts${params(query)}`),
    placeholderData: keepPreviousData,
  })
  const update = (key: string, value: string | null) => setSearch(prev => {
    const next = withParam(prev, key, value)
    if (key !== 'cpage') next.delete('cpage')
    return next
  }, { replace: true })
  const onSearch = useCallback((value: string | null) => setSearch(prev => {
    const next = withParam(prev, 'cq', value)
    next.delete('cpage')
    return next
  }, { replace: true }), [setSearch])
  const rows = list.data?.data ?? []
  const narrowed = q.trim() !== '' || status !== ''

  return (
    <div className="space-y-4">
      <Toolbar chips={narrowed ? <>
        {q.trim() && <FilterChip label={t('crm.contacts.chip.q', 'Search: {{value}}', { value: q.trim() })} removeLabel={t('crm.contacts.remove_filter', 'Remove the filter')} onRemove={() => onSearch(null)} />}
        {status && <FilterChip label={t('crm.contacts.chip.status', 'Status: {{value}}', { value: t(`crm.contacts.${companyStatusKey(status)}`, STATUS_FALLBACK[status]) })} removeLabel={t('crm.contacts.remove_filter', 'Remove the filter')} onRemove={() => update('cstatus', null)} />}
      </> : undefined}>
        <div className="min-w-0 sm:min-w-56 sm:flex-1">
          <SearchBox label={t('crm.contacts.company_search', 'Search by company, contact or industry')} value={q} onSearch={onSearch} />
        </div>
        <label className="min-w-0 sm:w-44">
          <span className="sr-only">{t('crm.contacts.company.status', 'Status')}</span>
          <Select value={status} onChange={e => update('cstatus', e.target.value)} className={status ? 'ring-1 ring-a-accent/60' : ''}>
            <option value="">{t('crm.contacts.company.status', 'Status')}</option>
            {COMPANY_STATUSES.map(v => <option key={v} value={v}>{t(`crm.contacts.${companyStatusKey(v)}`, STATUS_FALLBACK[v])}</option>)}
          </Select>
        </label>
      </Toolbar>

      <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}>
        {rows.length === 0 ? (
          <Card>
            {narrowed
              ? <EmptyState icon={Building2} title={t('crm.contacts.no_company_match', 'No company matches')} />
              : <EmptyState icon={Building2} title={t('crm.contacts.no_companies', 'No companies yet')}
                  line={t('crm.contacts.no_companies_line', 'Keep the businesses you work with here: their main contact, terms and the leads that came from them.')}
                  action={<Button onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.contacts.company_add', 'Add company')}</Button>} />}
          </Card>
        ) : (
          <Card padded={false}>
            <div aria-hidden className="hidden items-center gap-3 border-b border-a-border bg-a-surface-2/40 px-4 py-2.5 text-xs font-medium text-a-text-2 md:flex">
              <span className="w-9 shrink-0" />
              <span className="min-w-0 flex-1">{t('crm.contacts.col_company', 'Company')}</span>
              <span className="w-40">{t('crm.contacts.company.account_manager', 'Account manager')}</span>
              <span className="hidden w-32 text-right lg:block">{t('crm.contacts.company.contract', 'Contract')}</span>
              <span className="w-24 text-right">{t('crm.contacts.company.status', 'Status')}</span>
            </div>
            <ul className="divide-y divide-a-border">
              {rows.map(row => (
                <li key={row.id}>
                  <button type="button" onClick={() => setOpenId(row.id)} aria-current={openId === row.id ? 'true' : undefined}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${openId === row.id ? 'bg-a-accent/10' : ''}`}>
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-surface-2 text-a-text-2"><Building2 size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-a-text">{row.company_name}</span>
                      <span className="block truncate text-xs text-a-text-2">{[row.industry, row.contact_person].filter(Boolean).join(' · ') || '—'}</span>
                    </span>
                    <span className="hidden w-40 truncate text-xs text-a-text-2 md:block">{row.account_manager ?? ''}</span>
                    <span className="hidden w-32 text-right text-xs text-a-text-2 lg:block">
                      {row.contract_end ? t('crm.contacts.contract_until', 'Until {{day}}', { day: dayLabel(row.contract_end, lang) }) : ''}
                    </span>
                    <span className="shrink-0 md:w-24 md:text-right"><CompanyStatus status={row.status} /></span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {list.data && <Pager page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={next => update('cpage', String(next))} />}
      </QueryState>

      {openId !== null && <CompanyDetailPanel id={openId} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/** One company at a glance (GET corporate-accounts/{id}): its open pipeline, last contact, details and latest leads. */
function CompanyDetailPanel({ id, onClose }: { id: number; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const qc = useQueryClient()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const detail = useQuery({
    queryKey: [...CONTACTS, 'company', id],
    queryFn: () => get<CompanyDetail>(`corporate-accounts/${id}`),
  })
  const remove = useMutation({
    mutationFn: () => send('delete', `corporate-accounts/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'companies'] })
      qc.removeQueries({ queryKey: [...CONTACTS, 'company', id] })
      toast(t('crm.contacts.company_deleted', 'Company deleted'))
      onClose()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const c = detail.data
  const currency = boot.venue.currency

  if (editing && c) return <CompanyFormPanel company={c} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />

  return (
    <SidePanel title={c?.company_name ?? t('crm.contacts.company_title', 'Company')} onClose={onClose}
      footer={c && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {boot.staff.can.delete_records
            ? <Button variant="danger" size="sm" onClick={() => setDeleting(true)}><Trash2 size={15} aria-hidden />{t('crm.common.delete', 'Delete')}</Button>
            : <span />}
          <Button variant="secondary" onClick={() => setEditing(true)}><Pencil size={15} aria-hidden />{t('crm.common.edit', 'Edit')}</Button>
        </div>
      )}>
      <QueryState loading={detail.isLoading} error={detail.error} onRetry={() => { void detail.refetch() }}>
        {c && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <CompanyStatus status={c.status} />
              {c.ltv?.renewal_soon && c.contract_end && (
                <Pill tone="pending">{t('crm.contacts.renewal_soon', 'Contract ends {{day}}', { day: dayLabel(c.contract_end, lang) })}</Pill>
              )}
            </div>
            {c.ltv && (
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-a-border p-3">
                  <dt className="text-xs text-a-text-2">{t('crm.contacts.open_pipeline', 'Open pipeline')}</dt>
                  <dd className="mt-1 font-a-display text-2xl text-a-text">{money(c.ltv.open_pipeline_value, currency, lang)}</dd>
                  <dd className="text-xs text-a-text-2">{t('crm.contacts.open_leads', 'Open leads: {{count}}', { count: c.ltv.open_pipeline_count })}</dd>
                </div>
                <div className="rounded-xl border border-a-border p-3">
                  <dt className="text-xs text-a-text-2">{t('crm.contacts.last_contact', 'Last contact')}</dt>
                  <dd className="mt-1 text-sm font-medium text-a-text" title={dateTime(c.ltv.last_contact_at, lang, boot.venue.timezone)}>
                    {c.ltv.last_contact_at ? timeAgo(c.ltv.last_contact_at, lang) : t('crm.contacts.no_contact_yet', 'None yet')}
                  </dd>
                </div>
              </dl>
            )}
            <dl className="grid gap-3 sm:grid-cols-2">
              <Fact label={t('crm.contacts.company.industry', 'Industry')}>{c.industry || null}</Fact>
              <Fact label={t('crm.contacts.company.contact_person', 'Main contact')}>{c.contact_person || null}</Fact>
              <Fact label={t('crm.contacts.company.contact_email', 'Contact email')}>
                {c.contact_email ? <a className="text-a-accent-text hover:underline" href={`mailto:${c.contact_email}`}>{c.contact_email}</a> : null}
              </Fact>
              <Fact label={t('crm.contacts.company.contact_phone', 'Contact phone')}>
                {c.contact_phone ? <a className="text-a-accent-text hover:underline" href={`tel:${c.contact_phone.replace(/\s+/g, '')}`}>{c.contact_phone}</a> : null}
              </Fact>
              <Fact label={t('crm.contacts.company.account_manager', 'Account manager')}>{c.account_manager || null}</Fact>
              <Fact label={t('crm.contacts.company.payment_terms', 'Payment terms')}>{c.payment_terms || null}</Fact>
              <Fact label={t('crm.contacts.company.credit_limit', 'Credit limit')}>{c.credit_limit !== null && c.credit_limit !== undefined ? money(c.credit_limit, currency, lang) : null}</Fact>
              <Fact label={t('crm.contacts.company.contract', 'Contract')}>
                {c.contract_start || c.contract_end ? `${dayLabel(c.contract_start, lang) || '…'} – ${dayLabel(c.contract_end, lang) || '…'}` : null}
              </Fact>
              <Fact label={t('crm.contacts.company.billing_email', 'Billing email')}>{c.billing_email || null}</Fact>
              <Fact label={t('crm.contacts.company.tax_id', 'Tax ID')}>{c.tax_id || null}</Fact>
            </dl>
            {c.billing_address && <Fact label={t('crm.contacts.company.billing_address', 'Billing address')}><span className="whitespace-pre-wrap">{c.billing_address}</span></Fact>}
            {c.notes && <Fact label={t('crm.contacts.field.notes', 'Notes')}><span className="whitespace-pre-wrap">{c.notes}</span></Fact>}

            <Link to={`/crm/contacts?company=${encodeURIComponent(c.company_name)}`} onClick={onClose}
              className="inline-flex items-center gap-2 text-sm font-medium text-a-accent-text hover:underline">
              <Users size={15} aria-hidden />{t('crm.contacts.people_here', 'People at this company')}
            </Link>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-a-text">{t('crm.contacts.company_leads', 'Latest leads')}</h3>
              {(c.recent_inquiries ?? []).length === 0
                ? <p className="text-sm text-a-text-2">{t('crm.contacts.company_no_leads', 'No leads name this company yet.')}</p>
                : (
                  <ul className="divide-y divide-a-border rounded-xl border border-a-border">
                    {(c.recent_inquiries ?? []).map(lead => (
                      <li key={lead.id}>
                        <Link to={leadPath(lead.id)} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-a-surface-2">
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-a-text">{lead.guest_name ?? t('crm.common.no_name', 'No name')}</span>
                            <span className="block truncate text-xs text-a-text-2">{[lead.inquiry_type, timeAgo(lead.created_at, lang)].filter(Boolean).join(' · ')}</span>
                          </span>
                          {lead.total_value !== null && <span className="shrink-0 text-xs text-a-text-2">{money(lead.total_value, currency, lang)}</span>}
                          {lead.status && <Pill tone={LEAD_TONE[leadState(lead.status)]}>{lead.status}</Pill>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
            </section>
          </div>
        )}
      </QueryState>

      {deleting && c && (
        <Confirm title={t('crm.contacts.company_delete_title', 'Delete {{name}}?', { name: c.company_name })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setDeleting(false)}>
          {t('crm.contacts.company_delete_line', 'The company is deleted for good. Its leads and people stay, without the company.')}
        </Confirm>
      )}
    </SidePanel>
  )
}
