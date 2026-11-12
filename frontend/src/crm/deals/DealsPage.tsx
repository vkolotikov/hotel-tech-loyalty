import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Columns3, CreditCard, Download, PackageCheck, PlayCircle, Plus, Settings2, Sparkles, Trophy } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, money } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select, Toggle } from '../ui/inputs'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { CaptureDialog } from '../leads/CaptureDialog'
import { downloadText } from '../leads/download'
import { InlineSelect } from '../leads/InlineSelect'
import { useColumnSwitch, useCrmSettings, useLeadSettings } from '../leads/leadData'
import { LeadForm } from '../leads/LeadForm'
import { ownerOptions, type LeadDraft } from '../leads/leadLogic'
import { Popover } from '../ui/Menu'
import { DealList } from './DealList'
import { PaymentDialog } from './PaymentDialog'
import {
  DEAL_COLUMNS, DEAL_FILTERS, DEAL_SORTS, dealColumns, dealFilterCount, dealsExportQuery, dealsQuery, filterCount, PAYMENTS,
  readDealView, withDealView, writeDealView, type DealKpis, type DealRow, type DealView,
} from './dealLogic'
import { dealColumnLabel, dealFilterLabel, dealSortLabel, fulfilmentLabel, paymentLabel } from './dealWords'
import type { Paginated } from '../leads/leadTypes'

const BUTTON = 'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 text-sm font-medium text-a-text-2 transition-colors hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent'

/**
 * Deals (round 2, the main platform's Deals & fulfilment): the won leads, each walked through its steps — awaiting
 * payment, preparation, review, in progress, ready, completed (`PATCH deals/{id}/stage`) — and its payment (`PATCH
 * deals/{id}/payment`, what is still owed); the figures per step (`deals/kpis`, a tile opens its step), quick filters,
 * a search, the payment state and the owner, three sorts, the columns the full admin's switch keeps, and the CSV.
 * A deal is added here by hand or from a pasted message read by the AI (owner 2026-11-08): the lead form in its deal
 * mode, which closes the new lead as won through the server's own `/won`.
 */
export function DealsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const view = readDealView(sp)
  const settings = useCrmSettings()
  const lists = useLeadSettings()
  const team = useTeam()
  const columns = dealColumns(settings.data)
  const [paying, setPaying] = useState<DealRow | null>(null)
  const [exporting, setExporting] = useState(false)
  const [adding, setAdding] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captured, setCaptured] = useState<LeadDraft | null>(null)
  const closeForm = () => { setAdding(false); setCaptured(null) }

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

  const exportCsv = async () => {
    setExporting(true)
    try {
      const text = await get<string>(`inquiries${params(dealsExportQuery(view))}`)
      downloadText(typeof text === 'string' ? text : '', `deals-${boot.venue.today}.csv`, 'text/csv')
    } catch (error) {
      toast(errorText(t, error), 'danger')
    } finally {
      setExporting(false)
    }
  }

  const rows = deals.data?.data ?? []
  const owners = ownerOptions(boot.staff.name, lists.owners, team.data ?? [], view.owner || null)
  const filtered = view.filter !== 'all' || dealFilterCount(view) > 0
  const fig = (value: number | undefined) => (value === undefined ? undefined : money(value, boot.venue.currency, lang))
  const k = kpis.data

  return (
    <Page wide title={t('crm.nav.deals', 'Deals')} line={t('crm.deals.line', 'Won leads, followed through to the work done and the money in.')}
      actions={(
        <>
          {/* The AI capture is every staff member's (the server's `ai_capture`, the same answer its route gives). */}
          {boot.features.ai_capture && (
            <button type="button" onClick={() => setCapturing(true)}
              className="crm-ai-soft inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent">
              <Sparkles size={15} aria-hidden />{t('crm.deals.capture', 'From a message')}
            </button>
          )}
          <Button onClick={() => setAdding(true)} className="min-h-11"><Plus size={15} aria-hidden />{t('crm.deals.new', 'Add a deal')}</Button>
        </>
      )}>
      {k && (
        <section aria-label={t('crm.deals.figures', 'Deals at a glance')} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {typeof k.total === 'number' && <StatTile icon={Trophy} tone="accent" label={t('crm.deals.kpi_active', 'Deals in progress')} value={count(k.total, lang)} hint={t('crm.deals.kpi_active_hint', 'Won, not completed yet')} />}
          <StatTile icon={CreditCard} tone={k.awaiting_payment.count > 0 ? 'pending' : 'neutral'} label={t('crm.deals.kpi_unpaid', 'Not paid in full')} value={count(k.awaiting_payment.count, lang)} hint={fig(k.awaiting_payment.value)} />
          <StatTile icon={Settings2} tone="progress" label={fulfilmentLabel(t, 'design_needed')} value={count(k.design_needed.count, lang)} hint={fig(k.design_needed.value)} to="/crm/deals?filter=design_needed" />
          <StatTile icon={PlayCircle} tone="progress" label={fulfilmentLabel(t, 'in_production')} value={count(k.in_production.count, lang)} hint={fig(k.in_production.value)} to="/crm/deals?filter=in_production" />
          <StatTile icon={PackageCheck} tone="accent" label={fulfilmentLabel(t, 'ready_to_ship')} value={count(k.ready_to_ship.count, lang)} hint={fig(k.ready_to_ship.value)} to="/crm/deals?filter=ready_to_ship" />
          <StatTile icon={CheckCircle2} tone="success" label={t('crm.deals.kpi_completed', 'Completed this month')} value={count(k.completed_month.count, lang)} hint={fig(k.completed_month.value)} />
        </section>
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
          <>
            <label className="flex items-center gap-2">
              <span className="sr-only">{t('crm.deals.sort', 'Sort')}</span>
              <InlineSelect value={view.sort} onChange={e => set({ sort: e.target.value as DealView['sort'] })} aria-label={t('crm.deals.sort', 'Sort')}>
                {DEAL_SORTS.map(s => <option key={s} value={s}>{dealSortLabel(t, s)}</option>)}
              </InlineSelect>
            </label>
            <span className="hidden md:inline-flex"><DealColumnsMenu columns={columns} /></span>
            <button type="button" onClick={() => { void exportCsv() }} disabled={exporting} aria-busy={exporting || undefined} className={`${BUTTON} disabled:opacity-50`}>
              <Download size={15} aria-hidden /><span className="hidden lg:inline">{t('crm.deals.export', 'Export CSV')}</span><span className="sr-only lg:hidden">{t('crm.deals.export', 'Export CSV')}</span>
            </button>
          </>
        )}>
        <div className="w-full sm:w-64"><SearchInput label={t('crm.deals.search', 'Search a name or company')} value={q} onChange={setQ} /></div>
        <label className="block sm:w-44">
          <span className="sr-only">{t('crm.deals.payment', 'Payment')}</span>
          <Select value={view.payment} onChange={e => set({ payment: e.target.value })} aria-label={t('crm.deals.payment', 'Payment')}>
            <option value="">{t('crm.deals.any_payment', 'Any payment')}</option>
            {PAYMENTS.map(p => <option key={p} value={p}>{paymentLabel(t, p)}</option>)}
          </Select>
        </label>
        <label className="block sm:w-44">
          <span className="sr-only">{t('crm.deals.owner', 'Owner')}</span>
          <Select value={view.owner} onChange={e => set({ owner: e.target.value })} aria-label={t('crm.deals.owner', 'Owner')}>
            <option value="">{t('crm.deals.any_owner', 'Anyone')}</option>
            {owners.map(o => <option key={o} value={o}>{o}</option>)}
          </Select>
        </label>
      </Toolbar>

      <Tabs label={t('crm.deals.which', 'Which deals')} value={view.filter} onChange={filter => set({ filter })}
        items={DEAL_FILTERS.map(key => ({ key, label: dealFilterLabel(t, key), count: filterCount(key, k) }))} />

      <Card padded={false}>
        <QueryState loading={deals.isLoading} error={deals.error} onRetry={() => { void deals.refetch() }}>
          {rows.length === 0 ? (
            <EmptyState icon={Trophy} title={filtered ? t('crm.deals.none', 'No deal here') : t('crm.deals.empty', 'No won deals yet')}
              line={filtered ? t('crm.deals.none_line', 'Try another filter, or show every deal.') : t('crm.deals.empty_line', 'A lead marked won shows here, to follow through to payment.')}
              action={filtered ? <Button variant="secondary" onClick={() => { setQ(''); setSp(writeDealView({ ...view, filter: 'all', q: '', payment: '', owner: '', page: 1 }, sp), { replace: true }) }}>{t('crm.deals.show_all', 'Show every deal')}</Button> : undefined} />
          ) : (
            <>
              <div className="flex items-center justify-end border-b border-a-border px-4 py-2 text-xs text-a-text-2">
                {deals.isFetching && !deals.isLoading ? t('crm.common.loading', 'Loading…') : deals.data ? t('crm.common.total', '{{count}} in all', { count: deals.data.total }) : null}
              </div>
              <DealList deals={rows} columns={columns} onPay={setPaying} />
            </>
          )}
        </QueryState>
      </Card>
      {deals.data && <Pager page={deals.data.current_page} last={deals.data.last_page} total={deals.data.total} onPage={page => set({ page })} />}
      {paying && <PaymentDialog deal={paying} onClose={() => setPaying(null)} />}
      {adding && <LeadForm deal initial={captured} onClose={closeForm} />}
      {capturing && <CaptureDialog deal onClose={() => setCapturing(false)} onRead={draft => { setCapturing(false); setCaptured(draft); setAdding(true) }} />}
    </Page>
  )
}

/** The list's columns for the whole team (the full admin's `deal_fields` switch). */
function DealColumnsMenu({ columns }: { columns: ReturnType<typeof dealColumns> }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useColumnSwitch('deal_fields', e => toast(errorText(t, e), 'danger'))
  return (
    <Popover label={t('crm.deals.columns', 'Columns')} className={BUTTON}
      button={<><Columns3 size={15} aria-hidden /><span className="hidden lg:inline">{t('crm.deals.columns', 'Columns')}</span></>}>
      {(
        <div className="space-y-3 p-2">
          <p className="text-xs text-a-text-2">{t('crm.deals.columns_line', 'What the list shows, for everyone in your team.')}</p>
          {DEAL_COLUMNS.map(column => (
            <Toggle key={column} label={dealColumnLabel(t, column)} checked={columns[column]} onChange={on => save.mutate({ column, on })} />
          ))}
        </div>
      )}
    </Popover>
  )
}
