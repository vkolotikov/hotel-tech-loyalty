import { useEffect, useState, type ChangeEvent } from 'react'
import { useMutation, useQueries, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download, Filter, Plus, Target, Trash2, UserPlus, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, money, timeAgo } from '../lib/format'
import { leadPath } from '../lib/links'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { SearchInput, Select, TextInput } from '../ui/inputs'
import { InlineSelect } from './InlineSelect'
import { Page } from '../ui/Page'
import { Pager } from '../ui/Pager'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { Tabs } from '../ui/Tabs'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { downloadText } from './download'
import { useLeadChanged, useLeadSettings, usePipelines } from './leadData'
import {
  activeFilterCount, amount, bulkBody, defaultPipeline, DUE_FILTERS, dueSections, exportQuery, followUp, listQuery,
  ownerOptions, readFilters, resolveStage, SORT_KEYS, sortedStages, sourceOptions, stageColor, toggled, toggledAll,
  withFilter, writeFilters, type BulkAction, type LeadFilters,
} from './leadLogic'
import { LeadForm } from './LeadForm'
import type { LeadRow, Paginated, Stage } from './leadTypes'
import { dueLabel, sortLabel, sourceLabel } from './leadWords'

const key = (sp: URLSearchParams, name: string): string => sp.get(name) ?? ''

/**
 * Leads (2026-11-07): every open enquiry — from the website chat, forms and by hand — with search, the follow-ups due,
 * filters, paging, bulk changes and a CSV export. The rows are the full admin's (`GET inquiries`, open ones only: a won
 * lead is a deal, a lost one stays a contact); `?new=1` opens the form to add one.
 */
export function LeadsPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const lang = i18n.language
  const toast = useToast()
  const [sp, setSp] = useSearchParams()
  const filters = readFilters(sp)
  const me = boot.staff.name
  const [panel, setPanel] = useState(activeFilterCount(filters) > 0)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [exporting, setExporting] = useState(false)
  const pipelines = usePipelines()
  const stages = sortedStages(defaultPipeline(pipelines.data)?.stages)
  const creating = key(sp, 'new') === '1'
  const presetGuest = Number(key(sp, 'guest')) || null

  const apply = (next: LeadFilters) => { setSp(writeFilters(next, sp), { replace: true }); setSelected(new Set()) }
  const change = (patch: Partial<LeadFilters>) => apply(withFilter(filters, patch))
  const closeForm = () => { const next = new URLSearchParams(sp); next.delete('new'); next.delete('guest'); setSp(next, { replace: true }) }

  // The search box answers as one types, without asking the server at every key.
  const [q, setQ] = useState(filters.q)
  useEffect(() => {
    if (q === filters.q) return undefined
    const timer = window.setTimeout(() => change({ q }), 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

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

  const rows = list.data?.data ?? []
  const shownIds = sections.length ? due.flatMap(d => d.data?.data ?? []).map(r => r.id) : rows.map(r => r.id)
  const filterCount = activeFilterCount(filters)

  return (
    <Page title={t('crm.nav.leads', 'Leads')} line={t('crm.leads.line', 'Every open enquiry, from the website chat and everywhere else.')}
      actions={(
        <>
          <Button variant="secondary" onClick={() => { void exportCsv() }} loading={exporting}><Download size={15} aria-hidden />{t('crm.leads.export', 'Export CSV')}</Button>
          <Button onClick={() => { const next = new URLSearchParams(sp); next.set('new', '1'); setSp(next) }}><UserPlus size={15} aria-hidden />{t('crm.leads.new', 'Add a lead')}</Button>
        </>
      )}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput label={t('crm.leads.search', 'Search name, email, phone or company')} value={q} onChange={setQ} className="w-full sm:w-80" />
          <button type="button" aria-expanded={panel} onClick={() => setPanel(p => !p)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium ${filterCount > 0 ? 'border-a-accent/40 bg-a-accent/12 text-a-accent-text' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
            <Filter size={14} aria-hidden />{t('crm.leads.filters', 'Filters')}{filterCount > 0 ? ` · ${filterCount}` : ''}
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-a-text-2">
            <span className="hidden sm:inline">{t('crm.leads.sort', 'Sort')}</span>
            <InlineSelect value={filters.sort} onChange={e => change({ sort: e.target.value as LeadFilters['sort'] })} aria-label={t('crm.leads.sort', 'Sort')}>
              {SORT_KEYS.map(s => <option key={s} value={s}>{sortLabel(t, s)}</option>)}
            </InlineSelect>
          </label>
        </div>
        <Tabs label={t('crm.leads.follow_ups', 'Follow-ups')} value={filters.due} onChange={value => change({ due: value })}
          items={DUE_FILTERS.map(d => ({ key: d, label: dueLabel(t, d) }))} />
        {panel && <FilterPanel filters={filters} stages={stages} onChange={change} onClear={() => apply({ ...filters, status: '', source: '', owner: '', from: '', to: '', page: 1 })} />}
      </div>

      {selected.size > 0 && <BulkBar selected={selected} stages={stages} onDone={() => setSelected(new Set())} />}

      {sections.length > 0 ? (
        <div className="space-y-5">
          {sections.map((section, i) => {
            const result = due[i]
            const leads = result?.data?.data ?? []
            return (
              <Card key={section.key} padded={false}
                title={section.key === 'overdue' ? t('crm.leads.section_overdue', 'Overdue') : t('crm.leads.section_today', 'Due today')}
                action={result?.data ? <span className="text-xs text-a-text-2">{t('crm.common.total', '{{count}} in all', { count: result.data.total })}</span> : undefined}>
                <QueryState loading={result?.isLoading ?? true} error={result?.error} onRetry={() => { void result?.refetch() }} rows={2}>
                  {leads.length === 0
                    ? <p className="px-4 py-6 text-center text-sm text-a-text-2">{section.key === 'overdue' ? t('crm.leads.none_overdue', 'Nothing overdue.') : t('crm.leads.none_today', 'Nothing due today.')}</p>
                    : <LeadList leads={leads} stages={stages} selected={selected} onSelect={id => setSelected(s => toggled(s, id))} lang={lang} />}
                </QueryState>
              </Card>
            )
          })}
        </div>
      ) : (
        <Card padded={false}>
          <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}>
            {rows.length === 0 ? (
              filters.q || filters.due || filterCount > 0
                ? <EmptyState icon={Target} title={t('crm.leads.none_found', 'No lead matches')} line={t('crm.leads.none_found_line', 'Try another search or clear the filters.')}
                    action={<Button variant="secondary" onClick={() => { setQ(''); apply({ ...filters, q: '', due: '', status: '', source: '', owner: '', from: '', to: '', page: 1 }) }}>{t('crm.leads.clear', 'Clear filters')}</Button>} />
                : <EmptyState icon={Target} title={t('crm.leads.empty', 'No open leads yet')} line={t('crm.leads.empty_line', 'Leads come in from the website chat and your forms, or add one yourself.')}
                    action={<Button onClick={() => { const next = new URLSearchParams(sp); next.set('new', '1'); setSp(next) }}><Plus size={15} aria-hidden />{t('crm.leads.new', 'Add a lead')}</Button>} />
            ) : (
              <>
                <div className="flex items-center gap-3 border-b border-a-border px-4 py-2">
                  <label className="flex items-center gap-2 text-xs text-a-text-2">
                    <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={shownIds.length > 0 && shownIds.every(id => selected.has(id))}
                      onChange={() => setSelected(s => toggledAll(s, shownIds))} />
                    {t('crm.leads.select_page', 'Select this page')}
                  </label>
                  {list.isFetching && !list.isLoading && <span className="ml-auto text-xs text-a-text-2">{t('crm.common.loading', 'Loading…')}</span>}
                </div>
                <LeadList leads={rows} stages={stages} selected={selected} onSelect={id => setSelected(s => toggled(s, id))} lang={lang} />
              </>
            )}
          </QueryState>
        </Card>
      )}
      {sections.length === 0 && list.data && (
        <Pager page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={page => apply({ ...filters, page })} />
      )}

      {creating && <LeadForm presetGuest={presetGuest} onClose={closeForm} />}
    </Page>
  )
}

/** Stage, source, owner and the day it came in. */
function FilterPanel({ filters, stages, onChange, onClear }: { filters: LeadFilters; stages: Stage[]; onChange: (patch: Partial<LeadFilters>) => void; onClear: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const settings = useLeadSettings()
  const team = useTeam()
  const owners = ownerOptions(boot.staff.name, settings.owners, team.data ?? [], filters.owner && filters.owner !== 'me' ? filters.owner : null)
    .filter(o => o !== boot.staff.name)
  return (
    <div className="grid gap-3 rounded-2xl border border-a-border bg-a-surface p-4 sm:grid-cols-2 lg:grid-cols-5">
      <Field label={t('crm.leads.field_stage', 'Stage')}>
        <Select value={filters.status} onChange={e => onChange({ status: e.target.value })}>
          <option value="">{t('crm.leads.any_stage', 'Any stage')}</option>
          {stages.filter(s => s.kind === 'open').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
        </Select>
      </Field>
      <Field label={t('crm.leads.field_source', 'Where it came from')}>
        <Select value={filters.source} onChange={e => onChange({ source: e.target.value })}>
          <option value="">{t('crm.leads.any_source', 'Anywhere')}</option>
          {sourceOptions(settings.sources, filters.source).map(s => <option key={s} value={s}>{sourceLabel(t, s)}</option>)}
        </Select>
      </Field>
      <Field label={t('crm.leads.field_owner', 'Owner')}>
        <Select value={filters.owner} onChange={e => onChange({ owner: e.target.value })}>
          <option value="">{t('crm.leads.owner_anyone', 'Anyone')}</option>
          <option value="me">{t('crm.leads.owner_mine', 'Mine')}</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label={t('crm.leads.created_from', 'Came in from')}>
        <TextInput type="date" value={filters.from} onChange={e => onChange({ from: e.target.value })} />
      </Field>
      <Field label={t('crm.leads.created_to', 'Came in until')}>
        <TextInput type="date" value={filters.to} onChange={e => onChange({ to: e.target.value })} />
      </Field>
      {activeFilterCount(filters) > 0 && (
        <div className="sm:col-span-2 lg:col-span-5">
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-sm font-medium text-a-accent-text hover:underline"><X size={14} aria-hidden />{t('crm.leads.clear', 'Clear filters')}</button>
        </div>
      )}
    </div>
  )
}

/** The leads as rows: who, the stage, the follow-up, the value and the owner; a box to choose it for a bulk change. */
function LeadList({ leads, stages, selected, onSelect, lang }: { leads: LeadRow[]; stages: Stage[]; selected: ReadonlySet<number>; onSelect: (id: number) => void; lang: string }) {
  const { t } = useTranslation()
  const boot = useBoot()
  return (
    <ul className="divide-y divide-a-border">
      {leads.map(lead => {
        const name = lead.guest?.full_name || lead.guest?.email || t('crm.common.no_name', 'No name')
        const stage = resolveStage(lead, stages)
        const dot = stageColor(stage?.color)
        const next = followUp(lead, boot.venue.today)
        const value = amount(lead.total_value)
        return (
          <li key={lead.id} className="flex items-start gap-3 px-4 py-3 hover:bg-a-surface-2/60">
            <input type="checkbox" className="mt-2.5 h-4 w-4 shrink-0 accent-a-accent" checked={selected.has(lead.id)} onChange={() => onSelect(lead.id)}
              aria-label={t('crm.leads.select_named', 'Choose {{name}}', { name })} />
            <Link to={leadPath(lead.id)} className="flex min-w-0 flex-1 flex-col gap-1.5 md:flex-row md:items-center md:gap-4">
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={name} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-a-text">{name}{lead.guest?.company ? <span className="text-a-text-2"> · {lead.guest.company}</span> : null}</span>
                  <span className="block truncate text-xs text-a-text-2">{[lead.guest?.email, lead.guest?.phone || lead.guest?.mobile].filter(Boolean).join(' · ') || sourceLabel(t, lead.source)}</span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1.5 md:w-44 md:shrink-0">
                <Pill title={stage?.name ?? lead.status}>
                  {dot && <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: dot }} />}
                  {stage?.name ?? lead.status}
                </Pill>
                {lead.source && <span className="md:hidden"><Pill>{sourceLabel(t, lead.source)}</Pill></span>}
              </span>
              <span className="text-xs md:w-36 md:shrink-0">
                {next ? (
                  <span className={next.state === 'overdue' ? 'font-medium text-a-danger' : next.state === 'today' ? 'font-medium text-a-st-pending' : 'text-a-text-2'}>
                    {next.day ? (next.state === 'today' ? t('crm.leads.follow_today', 'Follow up today') : t('crm.leads.follow_on', 'Follow up {{day}}', { day: dayLabel(next.day, lang) })) : (next.type ?? '')}
                  </span>
                ) : <span className="text-a-text-2">{t('crm.leads.no_next', 'No next step')}</span>}
              </span>
              <span className="flex items-center gap-3 text-xs text-a-text-2 md:w-48 md:shrink-0 md:justify-end">
                {value !== null && <span className="font-medium text-a-text">{money(value, boot.venue.currency, lang)}</span>}
                <span className="truncate">{lead.assigned_to || t('crm.leads.owner_none', 'Nobody yet')}</span>
                <span className="hidden shrink-0 lg:inline">{timeAgo(lead.created_at, lang)}</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

/** One change for every lead chosen (`POST inquiries/bulk`): the stage, the owner, the priority, a follow-up, delete. */
function BulkBar({ selected, stages, onDone }: { selected: ReadonlySet<number>; stages: Stage[]; onDone: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const changed = useLeadChanged()
  const settings = useLeadSettings()
  const team = useTeam()
  const [deleting, setDeleting] = useState(false)
  const run = useMutation({
    mutationFn: ({ action, value }: { action: BulkAction; value?: string }) => {
      const body = bulkBody(selected, action, value)
      if (!body) throw new Error('nothing chosen')
      return send<{ updated?: number; deleted?: number }>('post', 'inquiries/bulk', body)
    },
    onSuccess: (result, vars) => {
      changed()
      setDeleting(false)
      onDone()
      toast(vars.action === 'delete'
        ? t('crm.leads.bulk_deleted', '{{count}} leads deleted', { count: result.deleted ?? 0 })
        : vars.action === 'mark_for_reengagement'
          ? t('crm.leads.bulk_followed', 'A follow-up task for tomorrow at 9:00 was added to {{count}} leads', { count: result.updated ?? 0 })
          : t('crm.leads.bulk_updated', '{{count}} leads changed', { count: result.updated ?? 0 }))
    },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const owners = ownerOptions(boot.staff.name, settings.owners, team.data ?? [])
  const pick = (action: BulkAction) => (e: ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value
    e.target.value = ''
    if (value === '') return
    run.mutate({ action, value: value === '__none__' ? '' : value })
  }

  return (
    <div className="sticky top-2 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-a-accent/30 bg-a-surface p-3 shadow-a">
      <span className="text-sm font-semibold text-a-text">{t('crm.leads.bulk_selected', '{{count}} chosen', { count: selected.size })}</span>
      <InlineSelect defaultValue="" onChange={pick('set_status')} disabled={run.isPending} aria-label={t('crm.leads.bulk_stage', 'Move to a stage')}>
        <option value="" disabled>{t('crm.leads.bulk_stage', 'Move to a stage')}</option>
        {stages.filter(s => s.kind === 'open').map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
      </InlineSelect>
      <InlineSelect defaultValue="" onChange={pick('set_assigned_to')} disabled={run.isPending} aria-label={t('crm.leads.bulk_owner', 'Give to')}>
        <option value="" disabled>{t('crm.leads.bulk_owner', 'Give to')}</option>
        <option value="__none__">{t('crm.leads.owner_none', 'Nobody yet')}</option>
        {owners.map(o => <option key={o} value={o}>{o}</option>)}
      </InlineSelect>
      <InlineSelect defaultValue="" onChange={pick('set_priority')} disabled={run.isPending} aria-label={t('crm.leads.bulk_priority', 'Set priority')}>
        <option value="" disabled>{t('crm.leads.bulk_priority', 'Set priority')}</option>
        {settings.priorities.map(p => <option key={p} value={p}>{p}</option>)}
      </InlineSelect>
      <Button variant="secondary" size="sm" onClick={() => run.mutate({ action: 'mark_for_reengagement' })} disabled={run.isPending}>{t('crm.leads.bulk_follow', 'Follow up tomorrow')}</Button>
      <Button variant="secondary" size="sm" onClick={() => setDeleting(true)} disabled={run.isPending}><Trash2 size={14} aria-hidden />{t('crm.common.delete', 'Delete')}</Button>
      <button type="button" onClick={onDone} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm text-a-text-2 hover:text-a-text"><X size={14} aria-hidden />{t('crm.leads.bulk_clear', 'Clear the choice')}</button>
      {deleting && (
        <Confirm title={t('crm.leads.bulk_delete_title', 'Delete {{count}} leads?', { count: selected.size })} confirm={t('crm.common.delete', 'Delete')}
          busy={run.isPending} onConfirm={() => run.mutate({ action: 'delete' })} onClose={() => setDeleting(false)}>
          <p>{t('crm.leads.bulk_delete_line', 'Their timelines, tasks and files go with them. The contacts stay.')}</p>
          {run.isError && <div className="mt-3"><Notice tone="danger">{errorText(t, run.error)}</Notice></div>}
        </Confirm>
      )}
    </div>
  )
}
