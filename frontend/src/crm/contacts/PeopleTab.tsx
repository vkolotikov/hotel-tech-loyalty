import { useCallback, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, Bookmark, Download, FileSpreadsheet, FileText, Plus, Trash2, Users, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { dayLabel, timeAgo } from '../lib/format'
import { useRecordList, useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { IconButton } from '../ui/IconButton'
import { Select, TextInput } from '../ui/inputs'
import { ActionMenu, Popover } from '../ui/Menu'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { FilterChip, Toolbar } from '../ui/Toolbar'
import {
  BULK_FIELDS, BULK_MAX, SORT_KEYS, activeFilterCount, activeFilters, allOnPage, bulkBody, displayName, exportParams, filtersFrom, listParams,
  pageFrom, segmentFilters, toggleId, togglePage, withParam, withSegment, withoutFilters,
  type BulkField, type ExportFormat, type FilterKey, type PeopleFilters, type SortKey,
} from './contactsLogic'
import { downloadContacts } from './download'
import { PeopleFiltersPanel } from './PeopleFilters'
import { StandingPills } from './parts'
import { SearchBox } from './SearchBox'
import { CONTACTS, refreshAfterContactChange, useContactLists, useTags, type ContactLists } from './queries'
import type { Guest, Paginated, Segment } from './types'

const SORT_FALLBACK: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', updated: 'Recently changed' }

/** A secondary control of the toolbar: an icon with its name as a tooltip (and a count beside it when one is set). */
const TOOL = 'relative inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-a-border bg-a-surface text-a-text-2 hover:bg-a-surface-2 hover:text-a-text focus-visible:outline-2 focus-visible:outline-a-accent'

/**
 * The people the venue deals with (round 5, "minimize copy, more icons … open, don't leave"): a search and a Filters
 * panel (every filter the full admin's Customers has but its loyalty tier), the order, saved views and the export as
 * icons; each row opens the contact in its panel over the list, which steps through the rows on the page.
 */
export function PeopleTab() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const toast = useToast()
  const records = useRecords()
  const [search, setSearch] = useSearchParams()
  const filters = filtersFrom(search)
  const page = pageFrom(search)
  const query = listParams(filters, page)
  const lists = useContactLists()
  const tags = useTags()

  const list = useQuery({
    queryKey: [...CONTACTS, 'list', query],
    queryFn: () => get<Paginated<Guest>>(`guests${params(query)}`),
    placeholderData: keepPreviousData,
  })

  // What is chosen belongs to the rows on screen: another page or filter starts with nothing chosen.
  const shownKey = JSON.stringify(query)
  const [seenKey, setSeenKey] = useState(shownKey)
  const [selected, setSelected] = useState<number[]>([])
  if (seenKey !== shownKey) {
    setSeenKey(shownKey)
    setSelected([])
  }

  const update = (key: string, value: string | null) => setSearch(prev => withParam(prev, key, value), { replace: true })
  const clearAll = () => setSearch(prev => withoutFilters(prev), { replace: true })
  const onSearch = useCallback((value: string | null) => setSearch(prev => withParam(prev, 'q', value), { replace: true }), [setSearch])
  const rows = list.data?.data ?? []
  const pageIds = rows.map(row => row.id)
  useRecordList('contact', pageIds)
  const narrowed = activeFilterCount(filters) > 0
  const tagName = (tags.data ?? []).find(tag => String(tag.id) === filters.tag)?.name

  const [exporting, setExporting] = useState(false)
  const exportRows = async (ids: number[], format: ExportFormat) => {
    setExporting(true)
    try {
      await downloadContacts(exportParams(filters, ids, format), format, boot.venue.today)
    } catch (error) {
      toast(errorText(t, error), 'danger')
    } finally {
      setExporting(false)
    }
  }

  const chipLabel = (key: FilterKey, value: string): string => {
    switch (key) {
      case 'q': return t('crm.contacts.chip.q', 'Search: {{value}}', { value })
      case 'lifecycle': return t('crm.contacts.chip.lifecycle', 'Lifecycle: {{value}}', { value })
      case 'importance': return t('crm.contacts.chip.importance', 'Importance: {{value}}', { value })
      case 'vip': return t('crm.contacts.chip.vip', 'VIP')
      case 'gtype': return t('crm.contacts.chip.gtype', 'Type: {{value}}', { value })
      case 'source': return t('crm.contacts.chip.source', 'Source: {{value}}', { value })
      case 'owner': return t('crm.contacts.chip.owner', 'Owner: {{value}}', { value })
      case 'country': return t('crm.contacts.chip.country', 'Country: {{value}}', { value })
      case 'nationality': return t('crm.contacts.chip.nationality', 'Nationality: {{value}}', { value })
      case 'tag': return t('crm.contacts.chip.tag', 'Tag: {{value}}', { value: tagName ?? value })
      case 'co': return t('crm.contacts.chip.company', 'Company: {{value}}', { value })
      case 'from': return t('crm.contacts.chip.from', 'Added from {{value}}', { value: dayLabel(value, lang) })
      case 'to': return t('crm.contacts.chip.to', 'Added until {{value}}', { value: dayLabel(value, lang) })
      case 'email': return t('crm.contacts.chip.email', 'Has email')
      case 'phone': return t('crm.contacts.chip.phone', 'Has phone')
    }
  }
  const chips = activeFilters(filters)

  return (
    <div className="space-y-3">
      <Toolbar
        actions={<>
          <ActionMenu label={t('crm.contacts.sort', 'Order')} icon={ArrowUpDown} className={TOOL}
            items={SORT_KEYS.map(key => ({ key, label: t(`crm.contacts.sorts.${key}`, SORT_FALLBACK[key]), checked: filters.sort === key, onSelect: () => update('sort', key === 'newest' ? null : key) }))} />
          <SavedViews filters={filters} />
          <ExportMenu label={t('crm.contacts.export', 'Export')} busy={exporting} disabled={!list.data || list.data.total === 0} onExport={format => { void exportRows([], format) }} />
        </>}
        chips={chips.length > 0 ? <>
          {chips.map(chip => (
            <FilterChip key={chip.key} label={chipLabel(chip.key, chip.value)} removeLabel={t('crm.contacts.remove_filter', 'Remove the filter')} onRemove={() => update(chip.key, null)} />
          ))}
          <button type="button" onClick={clearAll}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-a-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-a-accent">
            {t('crm.contacts.clear_filters', 'Clear filters')}
          </button>
        </> : undefined}>
        {/* The search and the Filters button share a row on every screen, so the filters panel opens leftwards from its edge. */}
        <div className="flex min-w-0 items-center gap-2 sm:min-w-56 sm:flex-1">
          <div className="min-w-0 flex-1"><SearchBox label={t('crm.contacts.search', 'Search by name, email, phone or company')} value={filters.q} onSearch={onSearch} /></div>
          <PeopleFiltersPanel filters={filters} lists={lists} tags={tags.data ?? []} onSet={update} onClear={clearAll} />
        </div>
      </Toolbar>

      {selected.length > 0 && (
        <BulkBar ids={selected} lists={lists} onClear={() => setSelected([])} onExport={format => { void exportRows(selected, format) }} exporting={exporting} />
      )}

      <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}>
        {rows.length === 0 ? (
          <Card>
            {narrowed
              ? <EmptyState icon={Users} title={t('crm.contacts.none_match', 'Nobody matches these filters')}
                  action={<Button variant="secondary" onClick={clearAll}><X size={15} aria-hidden />{t('crm.contacts.clear_filters', 'Clear filters')}</Button>} />
              : <EmptyState icon={Users} title={t('crm.contacts.empty', 'No contacts yet')}
                  action={<Button onClick={() => records.create('contact')}><Plus size={15} aria-hidden />{t('crm.common.add', 'Add')}</Button>} />}
          </Card>
        ) : (
          <Card padded={false}>
            <div className="flex items-center gap-3 border-b border-a-border bg-a-surface-2/40 px-4 py-2">
              <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={allOnPage(selected, pageIds)}
                onChange={() => setSelected(prev => togglePage(prev, pageIds))}
                aria-label={t('crm.contacts.choose_page', 'Choose every contact on this page')} />
              <span className="flex-1 text-xs font-medium text-a-text-2" aria-live="polite">
                {list.data ? t('crm.common.total', '{{count}} in all', { count: list.data.total }) : ''}
              </span>
              <span className="hidden w-56 text-xs font-medium text-a-text-2 lg:block">{t('crm.contacts.reach', 'Email and phone')}</span>
              <span className="hidden w-40 text-xs font-medium text-a-text-2 md:block">{t('crm.contacts.standing', 'Standing')}</span>
              <span className="hidden w-20 text-right text-xs font-medium text-a-text-2 md:block">{t('crm.contacts.added_when', 'Added')}</span>
            </div>
            <ul className="divide-y divide-a-border">
              {rows.map(row => {
                const name = displayName(row) ?? t('crm.common.no_name', 'No name')
                const chosen = selected.includes(row.id)
                const open = records.current?.kind === 'contact' && records.current.id === row.id
                return (
                  <li key={row.id} className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-a-surface-2 ${chosen || open ? 'bg-a-accent/10' : ''}`}>
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-a-accent" checked={chosen} onChange={() => setSelected(prev => toggleId(prev, row.id))}
                      aria-label={t('crm.contacts.choose', 'Choose {{name}}', { name })} />
                    <Link to={records.href('contact', row.id)} aria-current={open ? 'true' : undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-a-accent">
                      <Avatar name={name} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-a-text">{name}</span>
                        <span className="block truncate text-xs text-a-text-2">
                          {[row.position_title, row.company].filter(Boolean).join(' · ') || row.email || row.phone || '—'}
                        </span>
                        <span className="mt-1 flex md:hidden"><StandingPills lifecycle={row.lifecycle_status} importance={row.importance} levels={lists.importance} /></span>
                      </span>
                    </Link>
                    <span className="hidden w-56 min-w-0 text-xs text-a-text-2 lg:block">
                      <span className="block truncate">{row.email ?? '—'}</span>
                      <span className="block truncate">{row.phone ?? row.mobile ?? ''}</span>
                    </span>
                    <span className="hidden w-40 md:block"><StandingPills lifecycle={row.lifecycle_status} importance={row.importance} levels={lists.importance} /></span>
                    <span className="hidden w-20 text-right text-xs text-a-text-2 md:block">{timeAgo(row.created_at, lang)}</span>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
        {list.data && <Pager page={list.data.current_page} last={list.data.last_page} total={list.data.total} onPage={next => update('page', String(next))} />}
      </QueryState>
    </div>
  )
}

/** The export as a menu: the styled workbook (as the full admin's Export) or CSV. */
function ExportMenu({ label, busy, disabled, onExport, className = TOOL }: { label: string; busy: boolean; disabled: boolean; onExport: (format: ExportFormat) => void; className?: string }) {
  const { t } = useTranslation()
  return (
    <ActionMenu label={label} icon={Download} className={`${className} ${disabled || busy ? 'pointer-events-none opacity-50' : ''}`}
      items={[
        { key: 'xlsx', icon: FileSpreadsheet, label: t('crm.contacts.export_xlsx', 'Excel (.xlsx)'), onSelect: () => onExport('xlsx'), disabled: disabled || busy },
        { key: 'csv', icon: FileText, label: t('crm.contacts.export_csv', 'CSV'), onSelect: () => onExport('csv'), disabled: disabled || busy },
      ]} />
  )
}

/** Saved views (guests/segments): open one, keep the filters set now under a name, or remove one. */
function SavedViews({ filters }: { filters: PeopleFilters }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [, setSearch] = useSearchParams()
  const [naming, setNaming] = useState(false)
  const [name, setName] = useState('')
  const [removing, setRemoving] = useState<Segment | null>(null)
  const segments = useQuery({ queryKey: [...CONTACTS, 'segments'], queryFn: () => get<Segment[]>('guests/segments') })
  const toKeep = segmentFilters(filters)
  const canSave = Object.keys(toKeep).length > 0

  const save = useMutation({
    mutationFn: () => send<Segment>('post', 'guests/segments', { name: name.trim().slice(0, 120), filters: toKeep }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'segments'] })
      toast(t('crm.contacts.view_saved', 'View saved'))
      setNaming(false)
      setName('')
    },
  })
  const remove = useMutation({
    mutationFn: (segment: Segment) => send('delete', `guests/segments/${segment.id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [...CONTACTS, 'segments'] })
      toast(t('crm.contacts.view_removed', 'View removed'))
      setRemoving(null)
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const views = segments.data ?? []
  const label = t('crm.contacts.views', 'Saved views')

  return (
    <>
      <Popover label={label} width="w-64" className={TOOL}
        button={<><Bookmark size={16} aria-hidden />{views.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-a-surface-2 px-1.5 text-xs leading-5 text-a-text">{views.length}</span>}</>}>
        <div className="space-y-1">
          <p className="px-2 pb-1 pt-1 text-xs font-semibold text-a-text-2">{label}</p>
          {views.length === 0 && <p className="px-2 pb-1 text-sm text-a-text-2">{t('crm.contacts.no_views', 'None yet')}</p>}
          <ul>
            {views.map(view => (
              <li key={view.id} className="flex items-center gap-1">
                <button type="button" data-close onClick={() => setSearch(prev => withSegment(prev, view.filters), { replace: true })}
                  className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm text-a-text hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent">
                  <Bookmark size={14} aria-hidden className="shrink-0 text-a-text-2" /><span className="truncate">{view.name}</span>
                </button>
                <IconButton icon={X} size="sm" label={t('crm.contacts.remove_view', 'Remove the view {{name}}', { name: view.name })} onClick={() => setRemoving(view)} />
              </li>
            ))}
          </ul>
          <div className="border-t border-a-border pt-1">
            <button type="button" data-close disabled={!canSave} onClick={() => setNaming(true)}
              className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-a-accent-text hover:bg-a-surface-2 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-a-accent">
              <Plus size={14} aria-hidden />{t('crm.contacts.save_view', 'Save this view')}
            </button>
          </div>
        </div>
      </Popover>

      {naming && (
        <Dialog title={t('crm.contacts.save_view', 'Save this view')} onClose={() => setNaming(false)} busy={save.isPending}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (name.trim()) save.mutate() }}>
            {save.isError && <Notice tone="danger">{errorText(t, save.error)}</Notice>}
            <Field label={t('crm.contacts.view_name', 'Name')}>
              <TextInput value={name} onChange={e => setName(e.target.value)} maxLength={120} required autoFocus />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setNaming(false)}>{t('crm.common.cancel', 'Cancel')}</Button>
              <Button type="submit" loading={save.isPending} disabled={!name.trim()}>{t('crm.common.save', 'Save')}</Button>
            </div>
          </form>
        </Dialog>
      )}

      {removing && (
        <Confirm title={t('crm.contacts.remove_view_title', 'Remove this view?')} confirm={t('crm.contacts.remove', 'Remove')} busy={remove.isPending}
          onConfirm={() => remove.mutate(removing)} onClose={() => setRemoving(null)}>
          {t('crm.contacts.remove_view_line', '“{{name}}” goes from everyone’s saved views. The contacts stay.', { name: removing.name })}
        </Confirm>
      )}
    </>
  )
}

/** Many contacts at once: set their lifecycle, importance, type or VIP level, export them, or delete them (asked first). */
function BulkBar({ ids, lists, onClear, onExport, exporting }: {
  ids: number[]
  lists: ContactLists
  onClear: () => void
  onExport: (format: ExportFormat) => void
  exporting: boolean
}) {
  const { t } = useTranslation()
  const boot = useBoot()
  const qc = useQueryClient()
  const toast = useToast()
  const [field, setField] = useState<BulkField>('lifecycle_status')
  const [value, setValue] = useState('')
  const [confirming, setConfirming] = useState(false)
  const body = bulkBody(ids, field, value)
  const tooMany = ids.length > BULK_MAX

  const apply = useMutation({
    mutationFn: () => send<{ updated: number }>('post', 'guests/bulk-update', body),
    onSuccess: result => {
      refreshAfterContactChange(qc)
      toast(t('crm.contacts.bulk_updated', 'Changed: {{count}}', { count: result.updated }))
      setValue('')
      onClear()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })
  const remove = useMutation({
    mutationFn: () => send<{ deleted: number }>('post', 'guests/bulk-delete', { ids }),
    onSuccess: result => {
      refreshAfterContactChange(qc, { leadsToo: true })
      toast(t('crm.contacts.bulk_deleted', 'Deleted: {{count}}', { count: result.deleted }))
      setConfirming(false)
      onClear()
    },
    onError: error => toast(errorText(t, error), 'danger'),
  })

  const fieldLabel: Record<BulkField, string> = {
    lifecycle_status: t('crm.contacts.field.lifecycle_status', 'Lifecycle'),
    importance: t('crm.contacts.field.importance', 'Importance'),
    guest_type: t('crm.contacts.field.guest_type', 'Type'),
    vip_level: t('crm.contacts.field.vip_level', 'VIP level'),
  }
  const options = field === 'lifecycle_status' ? lists.lifecycle : field === 'importance' ? lists.importance : field === 'guest_type' ? lists.guestTypes : lists.vipLevels
  return (
    <section aria-label={t('crm.contacts.bulk', 'Change the chosen contacts')} className="space-y-2 rounded-2xl border border-a-accent/30 bg-a-accent/8 p-2.5">
      <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (body) apply.mutate() }}>
        <p className="mr-1 text-sm font-semibold text-a-text">{t('crm.contacts.chosen', '{{count}} chosen', { count: ids.length })}</p>
        <label className="min-w-0">
          <span className="sr-only">{t('crm.contacts.bulk_set', 'Set')}</span>
          <Select value={field} onChange={e => { setField(e.target.value as BulkField); setValue('') }} className="w-36">
            {BULK_FIELDS.map(key => <option key={key} value={key}>{fieldLabel[key]}</option>)}
          </Select>
        </label>
        <label className="min-w-0">
          <span className="sr-only">{t('crm.contacts.bulk_to', 'To')}</span>
          <Select value={value} onChange={e => setValue(e.target.value)} className="w-40">
            <option value="">{t('crm.contacts.bulk_pick', 'Choose…')}</option>
            {options.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </label>
        <Button type="submit" size="sm" className="min-h-10" disabled={!body} loading={apply.isPending}>{t('crm.contacts.bulk_apply', 'Apply')}</Button>
        <span className="ml-auto flex items-center gap-1">
          <ExportMenu label={t('crm.contacts.export', 'Export')} busy={exporting} disabled={false} onExport={onExport} />
          {boot.staff.can.delete_records && (
            <IconButton icon={Trash2} tone="danger" label={t('crm.common.delete', 'Delete')} onClick={() => setConfirming(true)} disabled={tooMany} />
          )}
          <IconButton icon={X} label={t('crm.contacts.clear_choice', 'Clear')} onClick={onClear} />
        </span>
      </form>
      {tooMany && <Notice tone="warning">{t('crm.contacts.too_many', 'Choose at most {{max}} contacts at a time.', { max: BULK_MAX })}</Notice>}

      {confirming && (
        <Confirm title={t('crm.contacts.bulk_delete_title', 'Delete the chosen contacts ({{count}})?', { count: ids.length })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirming(false)}>
          {t('crm.contacts.bulk_delete_line', 'Their leads and timelines are deleted with them. This cannot be undone.')}
        </Confirm>
      )}
    </section>
  )
}
