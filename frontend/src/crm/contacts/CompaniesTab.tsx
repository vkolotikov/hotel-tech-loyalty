import { useCallback } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Building2, Plus, UserRound } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { get, params } from '../lib/api'
import { dayLabel } from '../lib/format'
import { useRecordList, useRecords } from '../lib/useRecords'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Select } from '../ui/inputs'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { COMPANY_STATUSES, PER_PAGE, arg, companyStatusKey, optionsWith, pageFrom, withParam } from './contactsLogic'
import { CompanyStatus } from './parts'
import { CONTACTS, useContactLists } from './queries'
import { SearchBox } from './SearchBox'
import type { Company, Paginated } from './types'

const STATUS_FALLBACK: Record<string, string> = { Active: 'Active', Pending: 'Pending', Expired: 'Expired', Suspended: 'Suspended' }

/**
 * The companies the venue deals with (corporate accounts): search, status and account manager (as the full admin's
 * Companies); each row opens the company in its panel over the list, which steps through the rows on the page.
 */
export function CompaniesTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const records = useRecords()
  const lists = useContactLists()
  const [search, setSearch] = useSearchParams()
  const q = arg(search, 'cq')
  const status = (COMPANY_STATUSES as readonly string[]).includes(arg(search, 'cstatus')) ? arg(search, 'cstatus') : ''
  const manager = arg(search, 'cmanager')
  const page = pageFrom(search, 'cpage')
  const query = { search: q.trim(), status, account_manager: manager, page, per_page: PER_PAGE, sort: 'company_name', dir: 'asc' }

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
  useRecordList('company', rows.map(row => row.id))
  const narrowed = q.trim() !== '' || status !== '' || manager !== ''
  const statusWord = (v: string) => t(`crm.contacts.${companyStatusKey(v)}`, STATUS_FALLBACK[v])
  const removeLabel = t('crm.contacts.remove_filter', 'Remove the filter')
  const managers = optionsWith(lists.managers, manager)

  return (
    <div className="space-y-3">
      <Toolbar chips={narrowed ? <>
        {q.trim() && <FilterChip label={t('crm.contacts.chip.q', 'Search: {{value}}', { value: q.trim() })} removeLabel={removeLabel} onRemove={() => onSearch(null)} />}
        {status && <FilterChip label={t('crm.contacts.chip.status', 'Status: {{value}}', { value: statusWord(status) })} removeLabel={removeLabel} onRemove={() => update('cstatus', null)} />}
        {manager && <FilterChip label={t('crm.contacts.chip.manager', 'Manager: {{value}}', { value: manager })} removeLabel={removeLabel} onRemove={() => update('cmanager', null)} />}
      </> : undefined}>
        <div className="min-w-0 sm:min-w-56 sm:flex-1">
          <SearchBox label={t('crm.contacts.company_search', 'Search by company, contact or industry')} value={q} onSearch={onSearch} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <label className="min-w-0 sm:w-40">
            <span className="sr-only">{t('crm.contacts.company.status', 'Status')}</span>
            <Select value={status} onChange={e => update('cstatus', e.target.value)} className={status ? 'ring-1 ring-a-accent/60' : ''}>
              <option value="">{t('crm.contacts.company.status', 'Status')}</option>
              {COMPANY_STATUSES.map(v => <option key={v} value={v}>{statusWord(v)}</option>)}
            </Select>
          </label>
          {managers.length > 0 && (
            <label className="min-w-0 sm:w-44">
              <span className="sr-only">{t('crm.contacts.company.account_manager', 'Account manager')}</span>
              <Select value={manager} onChange={e => update('cmanager', e.target.value)} className={manager ? 'ring-1 ring-a-accent/60' : ''}>
                <option value="">{t('crm.contacts.company.account_manager', 'Account manager')}</option>
                {managers.map(v => <option key={v} value={v}>{v}</option>)}
              </Select>
            </label>
          )}
        </div>
      </Toolbar>

      <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}>
        {rows.length === 0 ? (
          <Card>
            {narrowed
              ? <EmptyState icon={Building2} title={t('crm.contacts.no_company_match', 'No company matches')} />
              : <EmptyState icon={Building2} title={t('crm.contacts.no_companies', 'No companies yet')}
                  action={<Button onClick={() => records.create('company')}><Plus size={15} aria-hidden />{t('crm.common.add', 'Add')}</Button>} />}
          </Card>
        ) : (
          <Card padded={false}>
            <div className="flex items-center gap-3 border-b border-a-border bg-a-surface-2/40 px-4 py-2 text-xs font-medium text-a-text-2">
              <span className="min-w-0 flex-1" aria-live="polite">{list.data ? t('crm.common.total', '{{count}} in all', { count: list.data.total }) : ''}</span>
              <span className="hidden w-40 md:block">{t('crm.contacts.company.account_manager', 'Account manager')}</span>
              <span className="hidden w-32 text-right lg:block">{t('crm.contacts.company.contract', 'Contract')}</span>
              <span className="hidden w-24 text-right md:block">{t('crm.contacts.company.status', 'Status')}</span>
            </div>
            <ul className="divide-y divide-a-border">
              {rows.map(row => {
                const open = records.current?.kind === 'company' && records.current.id === row.id
                return (
                  <li key={row.id}>
                    <Link to={records.href('company', row.id)} aria-current={open ? 'true' : undefined}
                      className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-a-accent ${open ? 'bg-a-accent/10' : ''}`}>
                      <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-a-st-progress/12 text-a-st-progress"><Building2 size={16} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-a-text">{row.company_name}</span>
                        <span className="block truncate text-xs text-a-text-2">{[row.industry, row.contact_person].filter(Boolean).join(' · ') || '—'}</span>
                      </span>
                      <span className="hidden w-40 min-w-0 items-center gap-1.5 truncate text-xs text-a-text-2 md:flex">
                        {row.account_manager && <><UserRound size={12} aria-hidden className="shrink-0" /><span className="truncate">{row.account_manager}</span></>}
                      </span>
                      <span className="hidden w-32 text-right text-xs text-a-text-2 lg:block">
                        {row.contract_end ? t('crm.contacts.contract_until', 'Until {{day}}', { day: dayLabel(row.contract_end, lang) }) : ''}
                      </span>
                      <span className="shrink-0 md:w-24 md:text-right"><CompanyStatus status={row.status} /></span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
        {list.data && <Pager page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={next => update('cpage', String(next))} />}
      </QueryState>
    </div>
  )
}
