import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Bookmark, BookmarkPlus, Columns3, Filter, Kanban, List, Star, StarOff, Trash2, Users, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { useBoot } from '../CrmProvider'
import { send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel } from '../lib/format'
import { SearchInput, Select, TextInput, Toggle } from '../ui/inputs'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import { useToast } from '../ui/Toast'
import { useTeam } from '../tasks/taskData'
import { VIEWS, type View } from './board'
import { useColumnSwitch, useGuestFacets, useLeadSettings, useSavedViews } from './leadData'
import { activeFilterCount, NOBODY, ownerOptions, PANEL_CLEARED, sortChoices, sourceOptions, type ExportFormat, type LeadFilters, type PhoneFilter } from './leadLogic'
import { activeChips, filtersFromView, hasViewState, leadColumnChoices, orderedViews, viewBody, type LeadColumn } from './listLogic'
import { ExportMenu, SortMenu, ToolPopover } from './toolbarParts'
import type { SavedView, Stage } from './leadTypes'
import { columnLabel, dueLabel, phoneLabel, sortLabel, sourceLabel, viewLabel } from './leadWords'

const BUTTON = 'inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent'
const QUIET = 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'
const ON = 'border-a-accent/40 bg-a-accent/12 text-a-accent-text'

/**
 * The Leads toolbar (round 2; round 5, owner 2026-11-12: "minimize copy, more icons"): the search and Filters on the
 * left; on the right the view switch, then the list's tools as icons — the order, the saved views, the columns and the
 * export (Excel or CSV, as the full admin's). The filters in force show as chips under it, each removable; the filter
 * panel opens under it. On a phone: the search and Filters, the tools in one row under them.
 */
export function LeadsToolbar({ filters, view, stages, columns, onChange, onApply, onView, onExport, exporting }: {
  filters: LeadFilters
  view: View
  stages: Stage[]
  columns: Record<LeadColumn, boolean>
  onChange: (patch: Partial<LeadFilters>) => void
  onApply: (next: LeadFilters) => void
  onView: (view: View) => void
  onExport: (format: ExportFormat) => void
  exporting: boolean
}) {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const hotel = boot.organization.industry === 'hotel'
  const [panel, setPanel] = useState(activeFilterCount(filters) > 0)
  const count = activeFilterCount(filters)
  const onList = view === 'list'

  // The search box answers as one types, without asking the server at every key.
  const [q, setQ] = useState(filters.q)
  const [seen, setSeen] = useState(filters.q)
  if (filters.q !== seen) { setSeen(filters.q); setQ(filters.q) }
  useEffect(() => {
    if (q === filters.q) return undefined
    const timer = window.setTimeout(() => onChange({ q }), 350)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const chipLabel = (key: ReturnType<typeof activeChips>[number]['key']): string => {
    switch (key) {
      case 'q': return t('crm.leads.chip_search', 'Search: {{value}}', { value: filters.q.trim() })
      case 'due': return dueLabel(t, filters.due)
      case 'status': return t('crm.leads.chip_stage', 'Stage: {{value}}', { value: filters.status })
      case 'source': return t('crm.leads.chip_source', 'From: {{value}}', { value: sourceLabel(t, filters.source) })
      case 'owner': return filters.owner === 'me' ? t('crm.leads.owner_mine', 'Mine') : filters.owner === NOBODY ? t('crm.leads.owner_nobody', 'Not assigned') : t('crm.leads.chip_owner', 'Owner: {{value}}', { value: filters.owner })
      case 'priority': return t('crm.leads.chip_priority', 'Priority: {{value}}', { value: filters.priority })
      case 'type': return t('crm.leads.chip_type', 'Type: {{value}}', { value: filters.type })
      case 'country': return t('crm.leads.chip_country', 'Country: {{value}}', { value: filters.country })
      case 'phone': return phoneLabel(t, filters.phone)
      default: return t('crm.leads.chip_dates', 'Came in: {{from}} – {{to}}', { from: dayLabel(filters.from, i18n.language) || '…', to: dayLabel(filters.to, i18n.language) || '…' })
    }
  }
  const chips = activeChips(filters, onList)
  const filtersLabel = t('crm.leads.filters', 'Filters')

  return (
    <div className="space-y-2">
      <Toolbar
        chips={chips.length > 0 ? (
          <>
            {chips.map(chip => (
              <FilterChip key={chip.key} label={chipLabel(chip.key)} removeLabel={t('crm.leads.chip_remove', 'Remove')}
                onRemove={() => { if (chip.key === 'q') setQ(''); onChange(chip.clear) }} />
            ))}
            {chips.length > 1 && (
              <button type="button" onClick={() => { setQ(''); onApply({ ...filters, ...PANEL_CLEARED, q: '', due: '', page: 1 }) }}
                className="rounded-full px-2 py-0.5 text-xs font-medium text-a-accent-text hover:underline">{t('crm.leads.clear', 'Clear filters')}</button>
            )}
          </>
        ) : undefined}
        actions={(
          /* On a phone the tools keep to the right edge, so the panels they open stay on the screen. */
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <ViewSwitch view={view} onView={onView} />
            <div className="ml-auto flex items-center gap-2">
              {onList && <SortMenu value={filters.sort} choices={sortChoices(hotel)} label={t('crm.leads.sort', 'Sort')} word={s => sortLabel(t, s)} onChange={sort => onChange({ sort })} />}
              <ViewsMenu filters={filters} onApply={next => { setQ(next.q); onApply(next) }} />
              {/* A phone shows each lead as a card: the columns are a wide screen's. */}
              {onList && <span className="hidden md:inline-flex"><ColumnsMenu columns={columns} hotel={hotel} /></span>}
              <ExportMenu onExport={onExport} busy={exporting} />
            </div>
          </div>
        )}>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <div data-leads-search className="min-w-0 flex-1 sm:w-72 sm:flex-none"><SearchInput label={t('crm.leads.search', 'Search name, email, phone or company')} value={q} onChange={setQ} /></div>
          <button type="button" aria-expanded={panel} aria-label={count > 0 ? `${filtersLabel} · ${count}` : filtersLabel} title={filtersLabel}
            onClick={() => setPanel(p => !p)} className={`${BUTTON} ${count > 0 ? ON : QUIET} shrink-0`}>
            <Filter size={15} aria-hidden /><span className="hidden sm:inline">{filtersLabel}</span>{count > 0 && <span className="rounded-full bg-a-accent px-1.5 text-xs font-semibold leading-5 text-a-accent-ink">{count}</span>}
          </button>
        </div>
      </Toolbar>
      {panel && <FilterPanel filters={filters} stages={stages} onChange={onChange} onClear={() => onApply({ ...filters, ...PANEL_CLEARED, page: 1 })} />}
    </div>
  )
}

/** List, Board or Team: one choice, its button pressed. */
function ViewSwitch({ view, onView }: { view: View; onView: (view: View) => void }) {
  const { t } = useTranslation()
  const icons = { list: List, board: Kanban, team: Users } as const
  return (
    <div role="group" aria-label={t('crm.leads.view', 'View')} className="inline-flex rounded-xl border border-a-border bg-a-surface-2 p-0.5">
      {VIEWS.map(v => {
        const Icon = icons[v]
        const on = v === view
        return (
          <button key={v} type="button" aria-pressed={on} onClick={() => onView(v)} title={viewLabel(t, v)}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'bg-a-surface text-a-text shadow-a-sm' : 'text-a-text-2 hover:text-a-text'}`}>
            <Icon size={15} aria-hidden /><span className="hidden xl:inline">{viewLabel(t, v)}</span><span className="sr-only xl:hidden">{viewLabel(t, v)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** The list's columns, switched for the whole team (the full admin's column popover, `crm-settings`). */
function ColumnsMenu({ columns, hotel }: { columns: Record<LeadColumn, boolean>; hotel: boolean }) {
  const { t } = useTranslation()
  const toast = useToast()
  const save = useColumnSwitch('inquiry_fields', e => toast(errorText(t, e), 'danger'))
  return (
    <ToolPopover label={t('crm.leads.columns', 'Columns')} icon={Columns3}>
      {(
        <div className="space-y-3 p-2">
          <p className="text-xs text-a-text-2">{t('crm.leads.columns_line', 'What the list shows, for everyone in your team.')}</p>
          {leadColumnChoices(hotel).map(column => (
            <Toggle key={column} label={columnLabel(t, column)} checked={columns[column]} onChange={on => save.mutate({ column, on })} />
          ))}
        </div>
      )}
    </ToolPopover>
  )
}

/**
 * The person's saved views (`saved-views`, the same ones the full admin's Leads page keeps): apply one, pin it, delete
 * it, or save what the list shows now under a name.
 */
function ViewsMenu({ filters, onApply }: { filters: LeadFilters; onApply: (next: LeadFilters) => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const toast = useToast()
  const qc = useQueryClient()
  const views = useSavedViews()
  const [name, setName] = useState('')
  const done = () => { void qc.invalidateQueries({ queryKey: ['crm', 'leads', 'views'] }) }
  const create = useMutation({
    mutationFn: () => {
      const body = viewBody(name, filters, boot.staff.name)
      if (!body) throw new Error('nothing to save')
      return send<SavedView>('post', 'saved-views', body)
    },
    onSuccess: () => { done(); setName(''); toast(t('crm.leads.view_saved', 'View saved')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const pin = useMutation({
    mutationFn: (v: SavedView) => send('put', `saved-views/${v.id}`, { is_pinned: !v.is_pinned }),
    onSuccess: done,
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const remove = useMutation({
    mutationFn: (v: SavedView) => send('delete', `saved-views/${v.id}`),
    onSuccess: () => { done(); toast(t('crm.leads.view_deleted', 'View deleted')) },
    onError: e => toast(errorText(t, e), 'danger'),
  })
  const list = orderedViews(views.data)
  const canSave = hasViewState(filters)
  return (
    <ToolPopover label={t('crm.leads.views', 'Saved views')} icon={Bookmark} count={list.length} width="w-72">
      {(
        <div className="space-y-2 p-1">
          {list.length === 0 && <p className="px-1.5 py-1 text-sm text-a-text-2">{t('crm.leads.views_none', 'No saved views yet. Filter the list, then save it here.')}</p>}
          {list.length > 0 && (
            <ul className="space-y-0.5">
              {list.map(v => (
                <li key={v.id} className="flex items-center gap-1">
                  <button type="button" data-close onClick={() => onApply(filtersFromView(v.filters, boot.staff.name))}
                    className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
                    <Bookmark size={14} aria-hidden className={`shrink-0 ${v.is_pinned ? 'text-a-accent-text' : 'text-a-text-2'}`} />
                    <span className="truncate">{v.name}</span>
                  </button>
                  <button type="button" onClick={() => pin.mutate(v)} aria-label={v.is_pinned ? t('crm.leads.view_unpin', 'Unpin {{name}}', { name: v.name }) : t('crm.leads.view_pin', 'Pin {{name}}', { name: v.name })}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
                    {v.is_pinned ? <StarOff size={14} aria-hidden /> : <Star size={14} aria-hidden />}
                  </button>
                  <button type="button" onClick={() => remove.mutate(v)} aria-label={t('crm.leads.view_delete', 'Delete {{name}}', { name: v.name })}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-a-text-2 hover:bg-a-danger/12 hover:text-a-danger">
                    <Trash2 size={14} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="space-y-2 border-t border-a-border pt-2" onSubmit={e => { e.preventDefault(); if (canSave && name.trim()) create.mutate() }}>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-a-text-2">{t('crm.leads.view_name', 'Save what the list shows as')}</span>
              <TextInput value={name} onChange={e => setName(e.target.value)} maxLength={80} disabled={!canSave} placeholder={canSave ? t('crm.leads.view_name_hint', 'Hot leads this month') : t('crm.leads.view_nothing', 'Choose a filter first')} />
            </label>
            <Button type="submit" size="sm" variant="secondary" full loading={create.isPending} disabled={!canSave || !name.trim()}>
              <BookmarkPlus size={14} aria-hidden />{t('crm.leads.view_save', 'Save the view')}
            </Button>
          </form>
        </div>
      )}
    </ToolPopover>
  )
}

/** Stage, source, owner, priority, type, country, phone and the day it came in. */
function FilterPanel({ filters, stages, onChange, onClear }: { filters: LeadFilters; stages: Stage[]; onChange: (patch: Partial<LeadFilters>) => void; onClear: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const settings = useLeadSettings()
  const team = useTeam()
  const facets = useGuestFacets()
  const owners = ownerOptions(boot.staff.name, settings.owners, team.data ?? [], filters.owner && filters.owner !== 'me' && filters.owner !== NOBODY ? filters.owner : null)
    .filter(o => o !== boot.staff.name)
  const countries = [...new Set([...(facets.data?.country ?? []), ...(filters.country ? [filters.country] : [])])]
  return (
    <div className="grid gap-3 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm animate-a-fade sm:grid-cols-2 lg:grid-cols-4">
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
          <option value={NOBODY}>{t('crm.leads.owner_nobody', 'Not assigned')}</option>
          {owners.map(o => <option key={o} value={o}>{o}</option>)}
        </Select>
      </Field>
      <Field label={t('crm.leads.field_priority', 'Priority')}>
        <Select value={filters.priority} onChange={e => onChange({ priority: e.target.value })}>
          <option value="">{t('crm.leads.any_priority', 'Any priority')}</option>
          {[...new Set([...settings.priorities, ...(filters.priority ? [filters.priority] : [])])].map(p => <option key={p} value={p}>{p}</option>)}
        </Select>
      </Field>
      {(settings.types.length > 0 || filters.type) && (
        <Field label={t('crm.leads.field_type', 'Type of enquiry')}>
          <Select value={filters.type} onChange={e => onChange({ type: e.target.value })}>
            <option value="">{t('crm.leads.any_type', 'Any type')}</option>
            {[...new Set([...settings.types, ...(filters.type ? [filters.type] : [])])].map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
      )}
      {(countries.length > 0) && (
        <Field label={t('crm.leads.field_country', 'Country')}>
          <Select value={filters.country} onChange={e => onChange({ country: e.target.value })}>
            <option value="">{t('crm.leads.any_country', 'Any country')}</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
      )}
      <Field label={t('crm.leads.field_phone_filter', 'Phone number')}>
        <Select value={filters.phone} onChange={e => onChange({ phone: e.target.value as PhoneFilter })}>
          {(['', 'yes', 'no'] as const).map(p => <option key={p} value={p}>{phoneLabel(t, p)}</option>)}
        </Select>
      </Field>
      <Field label={t('crm.leads.created_from', 'Came in from')}>
        <TextInput type="date" value={filters.from} onChange={e => onChange({ from: e.target.value })} />
      </Field>
      <Field label={t('crm.leads.created_to', 'Came in until')}>
        <TextInput type="date" value={filters.to} onChange={e => onChange({ to: e.target.value })} />
      </Field>
      {activeFilterCount(filters) > 0 && (
        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <button type="button" onClick={onClear} className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-a-accent-text hover:underline"><X size={14} aria-hidden />{t('crm.leads.clear', 'Clear filters')}</button>
        </div>
      )}
    </div>
  )
}
