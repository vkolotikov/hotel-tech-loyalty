import { useEffect, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Coins, Plus, Sparkles, Target, TrendingUp, UserPlus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../CrmProvider'
import { get, params } from '../lib/api'
import { errorText } from '../lib/errors'
import { count, money } from '../lib/format'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { TaskForm } from '../tasks/TaskForm'
import { readView, withView, type View } from './board'
import { BulkBar } from './BulkBar'
import { CaptureDialog } from './CaptureDialog'
import { downloadText } from './download'
import { LostDialog, WonDialog } from './LeadClose'
import { useLeadFields, useLeadKpis, useCrmSettings, usePipelines } from './leadData'
import { DeleteLead } from './LeadDelete'
import {
  activeFields, activeFilterCount, defaultPipeline, DUE_FILTERS, dueSections, exportQuery, listQuery, readFilters, sortedStages,
  toggled, toggledAll, withFilter, writeFilters, type LeadDraft, type LeadFilters,
} from './leadLogic'
import { LeadForm } from './LeadForm'
import { LeadList, type RowAsk } from './LeadList'
import { LeadsBoard, LeadsTeam } from './LeadsBoard'
import { LeadsToolbar } from './LeadsToolbar'
import { leadColumns, type LeadColumn } from './listLogic'
import type { LeadKpis, LeadRow, Paginated, Stage } from './leadTypes'
import { dueLabel } from './leadWords'

const key = (sp: URLSearchParams, name: string): string => sp.get(name) ?? ''

/** Whether a key press is typing (a box, a list, an editable area), where a shortcut must not fire. */
const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/**
 * Leads (round 2, "similar functionality … like we have in main platform leads"): every open enquiry — from the website
 * chat, forms and by hand — as a list, a board by stage (`?view=board`, the pipeline `?p=`) or by owner
 * (`?view=team`); the open pipeline's figures; one toolbar for the search, the filters, the saved views, the columns
 * and the CSV; bulk changes; adding a lead by hand (`?new=1`, `?guest=`) or from a pasted message read by the AI.
 * The rows are the full admin's (`GET inquiries`, open ones only: a won lead is a deal, a lost one stays a contact).
 * "/" goes to the search, Escape clears the choice.
 */
export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const filters = readFilters(sp)
  const view = readView(sp)
  const me = boot.staff.name
  const hotel = boot.organization.industry === 'hotel'
  const [exporting, setExporting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [captured, setCaptured] = useState<LeadDraft | null>(null)
  const [now] = useState(() => new Date())
  const pipelines = usePipelines()
  const settings = useCrmSettings()
  const columns = leadColumns(settings.data, hotel)
  const stages = sortedStages(defaultPipeline(pipelines.data)?.stages)
  const kpis = useLeadKpis()
  const creating = key(sp, 'new') === '1'
  const presetGuest = Number(key(sp, 'guest')) || null

  const apply = (next: LeadFilters) => setSp(writeFilters(next, sp), { replace: true })
  const change = (patch: Partial<LeadFilters>) => apply(withFilter(filters, patch))
  const openForm = () => { const next = new URLSearchParams(sp); next.set('new', '1'); setSp(next) }
  const closeForm = () => { const next = new URLSearchParams(sp); next.delete('new'); next.delete('guest'); setSp(next, { replace: true }); setCaptured(null) }

  // "/" puts the cursor in the search box (not while typing somewhere else).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target) || document.querySelector('[role="dialog"]')) return
      const box = document.querySelector<HTMLInputElement>('[data-leads-search] input')
      if (box) { e.preventDefault(); box.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const text = await get<string>(`inquiries${params(exportQuery(filters, me))}`)
      downloadText(typeof text === 'string' ? text : '', `leads-${boot.venue.today}.csv`, 'text/csv')
    } catch (error) {
      toast(errorText(t, error), 'danger')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page wide title={t('crm.nav.leads', 'Leads')} line={t('crm.leads.line', 'Every open enquiry, from the website chat and everywhere else.')}
      actions={(
        <>
          {/* The AI capture is the staff AI's (`feature:admin_ai`); a plan without it would only be refused. */}
          {boot.features.admin_ai && (
            <button type="button" onClick={() => setCapturing(true)}
              className="crm-ai-soft inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent">
              <Sparkles size={15} aria-hidden />{t('crm.leads.capture', 'From a message')}
            </button>
          )}
          <Button onClick={openForm} className="min-h-11"><UserPlus size={15} aria-hidden />{t('crm.leads.new', 'Add a lead')}</Button>
        </>
      )}>
      <Figures kpis={kpis.data} lang={lang} currency={boot.venue.currency} />

      <LeadsToolbar filters={filters} view={view} stages={stages} columns={columns} onChange={change} onApply={apply}
        onView={(next: View) => setSp(withView(sp, next), { replace: true })} onExport={() => { void exportCsv() }} exporting={exporting} />

      {view === 'board' ? <LeadsBoard filters={filters} now={now} />
        : view === 'team' ? <LeadsTeam filters={filters} now={now} />
        : <ListView filters={filters} apply={apply} change={change} stages={stages} columns={columns} kpis={kpis.data} now={now} onAdd={openForm} />}

      {creating && <LeadForm presetGuest={presetGuest} initial={captured} onClose={closeForm} />}
      {capturing && <CaptureDialog onClose={() => setCapturing(false)} onRead={draft => { setCapturing(false); setCaptured(draft); openForm() }} />}
    </Page>
  )
}

/** The open pipeline at a glance (`inquiries/kpis`): open leads, their value, the follow-ups due, new this week. */
function Figures({ kpis, lang, currency }: { kpis: LeadKpis | undefined; lang: string; currency: string }) {
  const { t } = useTranslation()
  if (!kpis) return null
  const delta = typeof kpis.new_delta_pct === 'number' ? kpis.new_delta_pct : null
  return (
    <section aria-label={t('crm.leads.figures', 'The open pipeline')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile icon={Target} tone="accent" label={t('crm.leads.kpi_open', 'Open leads')} value={count(kpis.total, lang)} />
      <StatTile icon={Coins} tone="success" label={t('crm.leads.kpi_value', 'Open value')} value={money(kpis.estimated_value, currency, lang)} />
      <StatTile icon={CalendarClock} tone={kpis.overdue > 0 ? 'danger' : 'pending'} label={t('crm.leads.kpi_due', 'Follow-ups due')}
        value={count(kpis.due_today + kpis.overdue, lang)} hint={t('crm.leads.kpi_overdue', '{{count}} overdue', { count: kpis.overdue })} to="/crm/leads?due=1" />
      <StatTile icon={TrendingUp} tone="progress" label={t('crm.leads.kpi_new', 'New this week')} value={count(kpis.new_this_week, lang)}
        hint={delta === null ? undefined : t('crm.leads.kpi_new_delta', '{{percent}} % on the week before', { percent: delta > 0 ? `+${delta}` : String(delta) })} />
    </section>
  )
}

/** The list view: the follow-up pills, the bulk bar, the rows (or the two "due now" sections) and the pages. */
function ListView({ filters, apply, change, stages, columns, kpis, now, onAdd }: {
  filters: LeadFilters
  apply: (next: LeadFilters) => void
  change: (patch: Partial<LeadFilters>) => void
  stages: Stage[]
  columns: Record<LeadColumn, boolean>
  kpis: LeadKpis | undefined
  now: Date
  onAdd: () => void
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const me = boot.staff.name
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [ask, setAsk] = useState<RowAsk | null>(null)
  const fieldsQuery = useLeadFields()
  const listFields = activeFields(fieldsQuery.data).filter(f => f.show_in_list)

  const query = listQuery(filters, me)
  const sections = dueSections(filters, me)
  const list = useQuery({
    queryKey: ['crm', 'leads', 'list', query],
    queryFn: () => get<Paginated<LeadRow>>(`inquiries${params(query)}`),
    enabled: sections.length === 0,
    placeholderData: previous => previous,
  })
  const due = useQueries({
    queries: sections.map(section => ({
      queryKey: ['crm', 'leads', 'due', section.key, section.query],
      queryFn: () => get<Paginated<LeadRow>>(`inquiries${params(section.query)}`),
    })),
  })

  // A new filter is a new list: the choice made on the old one is let go.
  const signature = JSON.stringify(query)
  const [seen, setSeen] = useState(signature)
  if (seen !== signature) { setSeen(signature); setSelected(new Set()) }

  // Escape lets go of the choice (a dialog or a menu that is open takes Escape first).
  useEffect(() => {
    if (selected.size === 0) return undefined
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  const rows = list.data?.data ?? []
  const shown = sections.length ? due.flatMap(d => d.data?.data ?? []) : rows
  const shownIds = shown.map(r => r.id)
  const filtered = Boolean(filters.q || filters.due || activeFilterCount(filters) > 0)
  const counts: Partial<Record<LeadFilters['due'], number>> = kpis ? { now: kpis.overdue + kpis.due_today, overdue: kpis.overdue, today: kpis.due_today } : {}
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const listProps = { stages, selected, onSelect: (id: number) => setSelected(s => toggled(s, id)), columns, fields: listFields, onAsk: setAsk, now }

  return (
    <div className="space-y-4">
      <Tabs label={t('crm.leads.follow_ups', 'Follow-ups')} value={filters.due} onChange={value => change({ due: value })}
        items={DUE_FILTERS.map(d => ({ key: d, label: dueLabel(t, d), count: counts[d] }))} />

      {selected.size > 0 && <BulkBar selected={selected} stages={stages} onDone={() => setSelected(new Set())} />}

      {sections.length > 0 ? (
        <div className="space-y-5">
          {sections.map((section, i) => {
            const result = due[i]
            const leads = result?.data?.data ?? []
            return (
              <Card key={section.key} padded={false} icon={CalendarClock} tone={section.key === 'overdue' ? 'danger' : 'pending'}
                title={section.key === 'overdue' ? t('crm.leads.section_overdue', 'Overdue') : t('crm.leads.section_today', 'Due today')}
                description={section.key === 'overdue' ? t('crm.leads.section_overdue_line', 'The next step was due before today.') : t('crm.leads.section_today_line', 'The next step is due today.')}
                action={result?.data ? <span className="text-xs text-a-text-2">{t('crm.common.total', '{{count}} in all', { count: result.data.total })}</span> : undefined}>
                <QueryState loading={result?.isLoading ?? true} error={result?.error} onRetry={() => { void result?.refetch() }} rows={2}>
                  {leads.length === 0
                    ? <p className="px-4 py-6 text-center text-sm text-a-text-2">{section.key === 'overdue' ? t('crm.leads.none_overdue', 'Nothing overdue.') : t('crm.leads.none_today', 'Nothing due today.')}</p>
                    : <LeadList leads={leads} {...listProps} />}
                </QueryState>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card padded={false}>
          <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}>
            {rows.length === 0 ? (
              filtered
                ? <EmptyState icon={Target} title={t('crm.leads.none_found', 'No lead matches')} line={t('crm.leads.none_found_line', 'Try another search or clear the filters.')}
                    action={<Button variant="secondary" onClick={() => apply({ ...filters, q: '', due: '', status: '', source: '', owner: '', priority: '', type: '', country: '', phone: '', from: '', to: '', page: 1 })}>{t('crm.leads.clear', 'Clear filters')}</Button>} />
                : <EmptyState icon={Target} title={t('crm.leads.empty', 'No open leads yet')} line={t('crm.leads.empty_line', 'Leads come in from the website chat and your forms, or add one yourself.')}
                    action={<Button onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.leads.new', 'Add a lead')}</Button>} />
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-a-border px-4 py-2">
                  <label className="flex min-h-9 items-center gap-2 text-xs text-a-text-2">
                    <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={shownIds.length > 0 && shownIds.every(id => selected.has(id))}
                      onChange={() => setSelected(s => toggledAll(s, shownIds))} />
                    {t('crm.leads.select_page', 'Select this page')}
                  </label>
                  <span className="ml-auto text-xs text-a-text-2">
                    {list.isFetching && !list.isLoading ? t('crm.common.loading', 'Loading…') : list.data ? t('crm.common.total', '{{count}} in all', { count: list.data.total }) : null}
                  </span>
                </div>
                <LeadList leads={rows} {...listProps} />
              </>
            )}
          </QueryState>
        </Card>
      )}
      {sections.length === 0 && list.data && (
        <Pager page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={page => apply({ ...filters, page })} />
      )}

      {ask?.kind === 'won' && <WonDialog leadId={ask.lead.id} name={name(ask.lead)} onClose={() => setAsk(null)} />}
      {ask?.kind === 'lost' && <LostDialog leadId={ask.lead.id} name={name(ask.lead)} onClose={() => setAsk(null)} />}
      {ask?.kind === 'delete' && <DeleteLead leadId={ask.lead.id} name={name(ask.lead)} onClose={() => setAsk(null)} />}
      {ask?.kind === 'task' && <TaskForm task={null} inquiryId={ask.lead.id} leadName={name(ask.lead)} onClose={() => setAsk(null)} />}
    </div>
  )
}
