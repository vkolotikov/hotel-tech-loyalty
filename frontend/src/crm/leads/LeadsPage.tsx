import { useEffect, useState } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarClock, Coins, Plus, Sparkles, Target, TrendingUp, UserPlus } from 'lucide-react'
import { useRecordList, useRecords } from '../lib/useRecords'
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
import { StatRow, StatTile } from '../ui/StatTile'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { TaskForm } from '../tasks/TaskForm'
import { readView, withView, type View } from './board'
import { BulkBar } from './BulkBar'
import { downloadBlob, exportName, getFile } from './download'
import { LostDialog, WonDialog } from './LeadClose'
import { useLeadFields, useLeadKpis, useCrmSettings, usePipelines } from './leadData'
import { DeleteLead } from './LeadDelete'
import {
  activeFields, activeFilterCount, defaultPipeline, DUE_FILTERS, dueSections, exportQuery, listQuery, readFilters, sortedStages,
  toggled, toggledAll, withFilter, writeFilters, type ExportFormat, type LeadFilters,
} from './leadLogic'
import { LeadForm } from './LeadForm'
import { LeadList, type RowAsk } from './LeadList'
import { LeadsBoard, LeadsTeam } from './LeadsBoard'
import { LeadsToolbar } from './LeadsToolbar'
import { leadColumns, type LeadColumn } from './listLogic'
import type { LeadKpis, LeadRow, Paginated, Stage } from './leadTypes'
import { dueLabel } from './leadWords'
import { leadFigures } from './recordLogic'

const key = (sp: URLSearchParams, name: string): string => sp.get(name) ?? ''

/** Whether a key press is typing (a box, a list, an editable area), where a shortcut must not fire. */
const typing = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
}

/**
 * Leads (round 2, "similar functionality … like we have in main platform leads"; round 5, owner 2026-11-12: "minimize
 * copy, more icons … opening tabs, slides"): every open enquiry — from the website chat, forms and by hand — as a list,
 * a board by stage (`?view=board`, the pipeline `?p=`) or by owner (`?view=team`); the open pipeline's figures (only
 * those worth showing); one toolbar for the search, the filters, the saved views, the columns and the export (Excel or
 * CSV); bulk changes. A lead opens in its panel over the page (`?lead=`); adding one, by hand or from a pasted message
 * read by the AI, is the header's New panel (`?create=lead|capture`, with a contact `&guest=`), and an old link to a
 * contact's "New lead" (`?new=1&guest=`) still opens the form with that contact. The rows are the full admin's (`GET inquiries`, open ones only: a won lead
 * is a deal, a lost one stays a contact). "/" goes to the search, Escape clears the choice.
 */
export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const records = useRecords()
  const [sp, setSp] = useSearchParams()
  const filters = readFilters(sp)
  const view = readView(sp)
  const me = boot.staff.name
  const hotel = boot.organization.industry === 'hotel'
  const [exporting, setExporting] = useState(false)
  const [now] = useState(() => new Date())
  const pipelines = usePipelines()
  const settings = useCrmSettings()
  const columns = leadColumns(settings.data, hotel)
  const stages = sortedStages(defaultPipeline(pipelines.data)?.stages)
  const kpis = useLeadKpis()
  // Old links to a contact's "New lead" (`?new=1&guest=`, before round 5) still open the form with that contact here;
  // a contact's "New lead" now opens the header's New panel (`?create=lead&guest=`, CreateHost), as New does.
  const creating = key(sp, 'new') === '1'
  const presetGuest = Number(key(sp, 'guest')) || null

  const apply = (next: LeadFilters) => setSp(writeFilters(next, sp), { replace: true })
  const change = (patch: Partial<LeadFilters>) => apply(withFilter(filters, patch))
  const closeForm = () => { const next = new URLSearchParams(sp); next.delete('new'); next.delete('guest'); setSp(next, { replace: true }) }

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

  const exportFile = async (format: ExportFormat) => {
    setExporting(true)
    try {
      const file = await getFile(`inquiries/export${params(exportQuery(filters, me, format))}`)
      downloadBlob(file, exportName('leads', boot.venue.today, format))
    } catch (error) {
      toast(errorText(t, error), 'danger')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Page wide icon={Target} title={t('crm.nav.leads', 'Leads')} line={t('crm.leads.line', 'Every open enquiry, from the website chat and everywhere else.')}
      actions={(
        <>
          {/* The AI capture is every staff member's (the server's `ai_capture`, the same answer its route gives). */}
          {boot.features.ai_capture && (
            <button type="button" onClick={() => records.create('capture')} title={t('crm.leads.capture_long', 'A lead from a message, read by the AI')}
              className="crm-ai-soft inline-flex min-h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-a-accent">
              <Sparkles size={15} aria-hidden /><span className="hidden sm:inline">{t('crm.leads.capture', 'From a message')}</span><span className="sr-only sm:hidden">{t('crm.leads.capture', 'From a message')}</span>
            </button>
          )}
          <Button onClick={() => records.create('lead')} className="min-h-10"><UserPlus size={15} aria-hidden />{t('crm.leads.new_short', 'Add')}</Button>
        </>
      )}>
      <Figures kpis={kpis.data} lang={lang} currency={boot.venue.currency} />

      <LeadsToolbar filters={filters} view={view} stages={stages} columns={columns} onChange={change} onApply={apply}
        onView={(next: View) => setSp(withView(sp, next), { replace: true })} onExport={format => { void exportFile(format) }} exporting={exporting} />

      {view === 'board' ? <LeadsBoard filters={filters} now={now} />
        : view === 'team' ? <LeadsTeam filters={filters} now={now} />
        : <ListView filters={filters} apply={apply} change={change} stages={stages} columns={columns} kpis={kpis.data} now={now} onAdd={() => records.create('lead')} />}

      {creating && <LeadForm presetGuest={presetGuest} onClose={closeForm} />}
    </Page>
  )
}

/** The open pipeline at a glance (`inquiries/kpis`): only the figures that hold something (`leadFigures`). */
function Figures({ kpis, lang, currency }: { kpis: LeadKpis | undefined; lang: string; currency: string }) {
  const { t } = useTranslation()
  const shown = leadFigures(kpis)
  if (!kpis || shown.length === 0) return null
  const delta = typeof kpis.new_delta_pct === 'number' ? kpis.new_delta_pct : null
  return (
    <StatRow label={t('crm.leads.figures', 'The open pipeline')} count={shown.length}>
      {shown.includes('open') && <StatTile icon={Target} tone="accent" label={t('crm.leads.kpi_open', 'Open leads')} value={count(kpis.total, lang)} />}
      {shown.includes('value') && <StatTile icon={Coins} tone="success" label={t('crm.leads.kpi_value', 'Open value')} value={money(kpis.estimated_value, currency, lang)} />}
      {shown.includes('due') && (
        <StatTile icon={CalendarClock} tone={kpis.overdue > 0 ? 'danger' : 'pending'} label={t('crm.leads.kpi_due', 'Follow-ups due')}
          value={count(kpis.due_today + kpis.overdue, lang)} hint={kpis.overdue > 0 ? t('crm.leads.kpi_overdue', '{{count}} overdue', { count: kpis.overdue }) : undefined} to="/crm/leads?due=1" />
      )}
      {shown.includes('new') && (
        <StatTile icon={TrendingUp} tone="progress" label={t('crm.leads.kpi_new', 'New this week')} value={count(kpis.new_this_week, lang)}
          hint={delta === null || delta === 0 ? undefined : t('crm.leads.kpi_new_delta_short', '{{percent}} %', { percent: delta > 0 ? `+${delta}` : String(delta) })} />
      )}
    </StatRow>
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
  const { t, i18n } = useTranslation()
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
  // The panel's previous and next walk the leads as the list shows them.
  useRecordList('lead', shownIds)
  const filtered = Boolean(filters.q || filters.due || activeFilterCount(filters) > 0)
  const counts: Partial<Record<LeadFilters['due'], number>> = kpis ? { now: kpis.overdue + kpis.due_today, overdue: kpis.overdue, today: kpis.due_today } : {}
  const name = (lead: LeadRow) => lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
  const listProps = { stages, selected, onSelect: (id: number) => setSelected(s => toggled(s, id)), columns, fields: listFields, onAsk: setAsk, now }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs label={t('crm.leads.follow_ups', 'Follow-ups')} value={filters.due} onChange={value => change({ due: value })}
          items={DUE_FILTERS.map(d => ({ key: d, label: dueLabel(t, d), count: counts[d] }))} />
        {sections.length === 0 && list.data && (
          <span className="ml-auto text-xs text-a-text-2" aria-live="polite">
            {list.isFetching && !list.isLoading ? t('crm.common.loading', 'Loading…') : t('crm.common.total', '{{count}} in all', { count: list.data.total })}
          </span>
        )}
      </div>

      {selected.size > 0 && <BulkBar selected={selected} stages={stages} onDone={() => setSelected(new Set())} />}

      {sections.length > 0 ? (
        <div className="space-y-5">
          {sections.map((section, i) => {
            const result = due[i]
            const leads = result?.data?.data ?? []
            return (
              <Card key={section.key} padded={false} icon={CalendarClock} tone={section.key === 'overdue' ? 'danger' : 'pending'}
                title={section.key === 'overdue' ? t('crm.leads.section_overdue', 'Overdue') : t('crm.leads.section_today', 'Due today')}
                hint={result?.data ? count(result.data.total, i18n.language) : undefined}>
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
                : <EmptyState icon={Target} title={t('crm.leads.empty', 'No open leads yet')} line={t('crm.leads.empty_line_short', 'From the chat, your forms, or by hand.')}
                    action={<Button onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.leads.new', 'Add a lead')}</Button>} />
            ) : (
              <>
                {/* A phone has no header row: the page's box sits over the cards. */}
                <label className="flex min-h-10 items-center gap-2 border-b border-a-border px-4 text-xs text-a-text-2 md:hidden">
                  <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={shownIds.length > 0 && shownIds.every(id => selected.has(id))}
                    onChange={() => setSelected(s => toggledAll(s, shownIds))} />
                  {t('crm.leads.select_page', 'Select this page')}
                </label>
                <LeadList leads={rows} onSelectAll={() => setSelected(s => toggledAll(s, shownIds))} {...listProps} />
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
