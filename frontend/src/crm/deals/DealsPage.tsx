import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BriefcaseBusiness, CheckCircle2, Columns3, CreditCard, Filter, PackageCheck, Plus, Sparkles, Trophy } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, money } from '../lib/format'
import { useRecordList, useRecords } from '../lib/useRecords'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select, Toggle } from '../ui/inputs'
import { Popover } from '../ui/Menu'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { StatRow, StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { downloadBlob, exportName, getFile } from '../leads/download'
import { useColumnSwitch, useCrmSettings, useLeadSettings } from '../leads/leadData'
import { ownerOptions, type ExportFormat } from '../leads/leadLogic'
import { dealFigures } from '../leads/recordLogic'
import { ExportMenu, SortMenu, ToolPopover } from '../leads/toolbarParts'
import { DealList } from './DealList'
import { PaymentDialog } from './PaymentDialog'
import {
  DEAL_COLUMNS, DEAL_FILTERS, DEAL_SORTS, dealColumns, dealFilterCount, dealsExportQuery, dealsQuery, filterCount, PAYMENTS,
  readDealView, withDealView, writeDealView, type DealKpis, type DealRow, type DealView,
} from './dealLogic'
import { dealColumnLabel, dealFilterLabel, dealSortLabel, fulfilmentLabel, paymentLabel } from './dealWords'
import type { Paginated } from '../leads/leadTypes'

const BUTTON = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent'

/**
 * Deals (round 2, the main platform's Deals & fulfilment; round 5, owner 2026-11-12: "minimize copy, more icons …
 * popups"): the won leads, each walked through its steps — awaiting payment, preparation, review, in progress, ready,
 * completed (`PATCH deals/{id}/stage`) — and its payment (`PATCH deals/{id}/payment`, what is still owed); at most four
 * figures, only those that hold something (`deals/kpis`); step pills with the server's counts; a search, Filters for
 * the payment and the owner, three sorts, the columns the full admin's switch keeps, and the export (Excel or CSV). A
 * deal opens in its lead's panel on the Deal tab (`?lead=&rtab=deal`); one is added by hand or from a pasted message
 * read by the AI in the header's New panel (`?create=deal|deal_capture`): the lead form in its deal mode, which closes
 * the new lead as won through the server's own `/won`.
 */
export function DealsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const records = useRecords()
  const [sp, setSp] = useSearchParams()
  const view = readDealView(sp)
  const settings = useCrmSettings()
  const lists = useLeadSettings()
  const team = useTeam()
  const columns = dealColumns(settings.data)
  const [paying, setPaying] = useState<DealRow | null>(null)
  const [exporting, setExporting] = useState(false)

  const set = (patch: Partial<DealView>) => setSp(writeDealView(withDealView(view, patch), sp), { replace: true })
  const query = dealsQuery(view.filter, view.page, view.sort, { q: view.q, payment: view.payment, owner: view.owner })
  const deals = useQuery({ queryKey: ['crm', 'deals', 'list', query], queryFn: () => get<Paginated<DealRow>>(`deals${params(query)}`), placeholderData: p => p })
  const kpis = useQuery({ queryKey: ['crm', 'deals', 'kpis'], queryFn: () => get<DealKpis>('deals/kpis'), staleTime: 60_000, refetchInterval: 60_000 })

  // The search answers as one types, without asking the server at every key.
  const [q, setQ] = useState(view.q)
  const [seen, setSeen] = useState(view.q)
  if (view.q !== seen) { setSeen(view.q); setQ(view.q) }
  useEffect(() => {
    if (q === view.q) return undefined
    const timer = window.setTimeout(() => set({ q }), 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const exportFile = async (format: ExportFormat) => {
    setExporting(true)
    try {
      const file = await getFile(`inquiries/export${params(dealsExportQuery(view, format))}`)
      downloadBlob(file, exportName('deals', boot.venue.today, format))
    } catch (error) {
      toast(errorText(t, error), 'danger')
    } finally {
      setExporting(false)
    }
  }

  const rows = deals.data?.data ?? []
  // The panel's previous and next walk the deals as the list shows them.
  useRecordList('lead', rows.map(row => row.id))
  const owners = ownerOptions(boot.staff.name, lists.owners, team.data ?? [], view.owner || null)
  const filtered = view.filter !== 'all' || dealFilterCount(view) > 0
  const panelCount = [view.payment, view.owner].filter(Boolean).length
  const fig = (value: number | undefined) => (value === undefined ? undefined : money(value, boot.venue.currency, lang))
  const k = kpis.data
  const shown = dealFigures(k)
  const filtersLabel = t('crm.deals.filters', 'Filters')

  return (
    <Page wide icon={BriefcaseBusiness} title={t('crm.nav.deals', 'Deals')} line={t('crm.deals.line', 'Won leads, followed through to the work done and the money in.')}
      actions={(
        <>
          {/* The AI capture is every staff member's (the server's `ai_capture`, the same answer its route gives). */}
          {boot.features.ai_capture && (
            <button type="button" onClick={() => records.create('deal_capture')} title={t('crm.deals.capture_long', 'A deal from a message, read by the AI')}
              className="crm-ai-soft inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent">
              <Sparkles size={15} aria-hidden /><span className="hidden sm:inline">{t('crm.deals.capture', 'From a message')}</span><span className="sr-only sm:hidden">{t('crm.deals.capture', 'From a message')}</span>
            </button>
          )}
          <Button onClick={() => records.create('deal')} className="min-h-10"><Plus size={15} aria-hidden />{t('crm.deals.new_short', 'Add')}</Button>
        </>
      )}>
      {k && shown.length > 0 && (
        <StatRow label={t('crm.deals.figures', 'Deals at a glance')} count={shown.length}>
          {shown.includes('active') && <StatTile icon={Trophy} tone="accent" label={t('crm.deals.kpi_active', 'Deals in progress')} value={count(k.total ?? 0, lang)} />}
          {shown.includes('unpaid') && <StatTile icon={CreditCard} tone="pending" label={t('crm.deals.kpi_unpaid', 'Not paid in full')} value={count(k.awaiting_payment.count, lang)} hint={fig(k.awaiting_payment.value)} />}
          {shown.includes('ready') && <StatTile icon={PackageCheck} tone="accent" label={fulfilmentLabel(t, 'ready_to_ship')} value={count(k.ready_to_ship.count, lang)} hint={fig(k.ready_to_ship.value)} to="/crm/deals?filter=ready_to_ship" active={view.filter === 'ready_to_ship'} />}
          {shown.includes('completed') && <StatTile icon={CheckCircle2} tone="success" label={t('crm.deals.kpi_completed', 'Completed this month')} value={count(k.completed_month.count, lang)} hint={fig(k.completed_month.value)} />}
        </StatRow>
      )}

      <Toolbar
        chips={dealFilterCount(view) > 0 ? (
          <>
            {view.q.trim() && <FilterChip label={t('crm.deals.chip_search', 'Search: {{value}}', { value: view.q.trim() })} removeLabel={t('crm.deals.chip_remove', 'Remove')} onRemove={() => { setQ(''); set({ q: '' }) }} />}
            {view.payment && <FilterChip label={t('crm.deals.chip_payment', 'Payment: {{value}}', { value: paymentLabel(t, view.payment) })} removeLabel={t('crm.deals.chip_remove', 'Remove')} onRemove={() => set({ payment: '' })} />}
            {view.owner && <FilterChip label={t('crm.deals.chip_owner', 'Owner: {{value}}', { value: view.owner })} removeLabel={t('crm.deals.chip_remove', 'Remove')} onRemove={() => set({ owner: '' })} />}
          </>
        ) : undefined}
        actions={(
          <div className="flex w-full items-center justify-end gap-2 sm:w-auto">
            <SortMenu value={view.sort} choices={DEAL_SORTS} label={t('crm.deals.sort', 'Sort')} word={s => dealSortLabel(t, s)} onChange={sort => set({ sort })} />
            <span className="hidden md:inline-flex"><DealColumnsMenu columns={columns} /></span>
            <ExportMenu onExport={format => { void exportFile(format) }} busy={exporting} />
          </div>
        )}>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <div className="min-w-0 flex-1 sm:w-64 sm:flex-none"><SearchInput label={t('crm.deals.search', 'Search a name or company')} value={q} onChange={setQ} /></div>
          <Popover label={panelCount > 0 ? `${filtersLabel} · ${panelCount}` : filtersLabel} align="left" width="w-72"
            className={`${BUTTON} shrink-0 ${panelCount > 0 ? 'border-a-accent/40 bg-a-accent/12 text-a-accent-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}
            button={<><Filter size={15} aria-hidden /><span className="hidden sm:inline">{filtersLabel}</span>{panelCount > 0 && <span className="rounded-full bg-a-accent px-1.5 text-xs font-semibold leading-5 text-a-accent-ink">{panelCount}</span>}</>}>
            <div className="space-y-3 p-2">
              <Field label={t('crm.deals.payment', 'Payment')}>
                <Select value={view.payment} onChange={e => set({ payment: e.target.value })}>
                  <option value="">{t('crm.deals.any_payment', 'Any payment')}</option>
                  {PAYMENTS.map(p => <option key={p} value={p}>{paymentLabel(t, p)}</option>)}
                </Select>
              </Field>
              <Field label={t('crm.deals.owner', 'Owner')}>
                <Select value={view.owner} onChange={e => set({ owner: e.target.value })}>
                  <option value="">{t('crm.deals.any_owner', 'Anyone')}</option>
                  {owners.map(o => <option key={o} value={o}>{o}</option>)}
                </Select>
              </Field>
            </div>
          </Popover>
        </div>
      </Toolbar>

      <div className="flex items-center gap-2">
        {/* The step pills scroll sideways on a phone rather than wrap onto more rows. */}
        <div className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">
          <div className="w-max">
            <Tabs label={t('crm.deals.which', 'Which deals')} value={view.filter} onChange={filter => set({ filter })}
              items={DEAL_FILTERS.map(key => ({ key, label: dealFilterLabel(t, key), count: filterCount(key, k) }))} />
          </div>
        </div>
        {deals.data && rows.length > 0 && (
          <span className="shrink-0 text-xs text-a-text-2" aria-live="polite">
            {deals.isFetching && !deals.isLoading ? t('crm.common.loading', 'Loading…') : t('crm.common.total', '{{count}} in all', { count: deals.data.total })}
          </span>
        )}
      </div>

      <Card padded={false}>
        <QueryState loading={deals.isLoading} error={deals.error} onRetry={() => { void deals.refetch() }}>
          {rows.length === 0 ? (
            <EmptyState icon={Trophy} title={filtered ? t('crm.deals.none', 'No deal here') : t('crm.deals.empty', 'No won deals yet')}
              line={filtered ? undefined : t('crm.deals.empty_line_short', 'A lead marked won shows here.')}
              action={filtered ? <Button variant="secondary" onClick={() => { setQ(''); setSp(writeDealView({ ...view, filter: 'all', q: '', payment: '', owner: '', page: 1 }, sp), { replace: true }) }}>{t('crm.deals.show_all', 'Show every deal')}</Button> : undefined} />
          ) : <DealList deals={rows} columns={columns} onPay={setPaying} />}
        </QueryState>
      </Card>
      {deals.data && <Pager page={deals.data.current_page} last={deals.data.last_page} total={deals.data.total} onPage={page => set({ page })} />}
      {paying && <PaymentDialog deal={paying} onClose={() => setPaying(null)} />}
    </Page>
  )
}

/** The list's columns for the whole team (the full admin's `deal_fields` switch). */
function DealColumnsMenu({ columns }: { columns: ReturnType<typeof dealColumns> }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useColumnSwitch('deal_fields', e => toast(errorText(t, e), 'danger'))
  return (
    <ToolPopover label={t('crm.deals.columns', 'Columns')} icon={Columns3}>
      {(
        <div className="space-y-3 p-2">
          <p className="text-xs text-a-text-2">{t('crm.deals.columns_line', 'What the list shows, for everyone in your team.')}</p>
          {DEAL_COLUMNS.map(column => (
            <Toggle key={column} label={dealColumnLabel(t, column)} checked={columns[column]} onChange={on => save.mutate({ column, on })} />
          ))}
        </div>
      )}
    </ToolPopover>
  )
}
