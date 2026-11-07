import { useCallback, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Bookmark, Building2, Download, Plus, Trash2, Users, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../CrmProvider'
import { get, params, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { contactPath } from '../lib/links'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { Select, TextInput } from '../ui/inputs'
import { Pager } from '../ui/Pager'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { Dialog } from '../../workspace/ui/Dialog'
import {
  BULK_FIELDS, BULK_MAX, SORT_KEYS, activeFilterCount, allOnPage, bulkBody, csvWithBom, displayName, exportName, exportParams,
  filtersFrom, listParams, optionsWith, pageFrom, segmentFilters, toggleId, togglePage, withParam, withSegment, withoutFilters,
  type BulkField, type PeopleFilters, type SortKey,
} from './contactsLogic'
import { StandingPills } from './parts'
import { SearchBox } from './SearchBox'
import { CONTACTS, refreshAfterContactChange, saveTextFile, useContactLists, useFacets, useTags } from './queries'
import type { Guest, Paginated, Segment } from './types'

const SORT_FALLBACK: Record<SortKey, string> = { newest: 'Newest first', oldest: 'Oldest first', updated: 'Recently changed' }

/** The people the venue deals with: search, filters from the server's own values, saved views, paging, bulk changes. */
export function PeopleTab({ onAdd }: { onAdd: () => void }) {
  const { t, i18n } = useTranslation()
  const lang = i18n.language
  const boot = useBoot()
  const toast = useToast()
  const [search, setSearch] = useSearchParams()
  const filters = filtersFrom(search)
  const page = pageFrom(search)
  const query = listParams(filters, page)
  const lists = useContactLists()
  const facets = useFacets()
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
  const onSearch = useCallback((value: string | null) => setSearch(prev => withParam(prev, 'q', value), { replace: true }), [setSearch])
  const rows = list.data?.data ?? []
  const pageIds = rows.map(row => row.id)
  const narrowed = activeFilterCount(filters) > 0
  const tagName = (tags.data ?? []).find(tag => String(tag.id) === filters.tag)?.name

  const [exporting, setExporting] = useState(false)
  const exportCsv = async (ids: number[]) => {
    setExporting(true)
    try {
      const text = await get<string>(`guests/export${params(exportParams(filters, ids))}`)
      saveTextFile(csvWithBom(typeof text === 'string' ? text : ''), exportName(boot.venue.today), 'text/csv;charset=utf-8')
    } catch (error) {
      toast(errorText(t, error), 'danger')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <SearchBox label={t('crm.contacts.search', 'Search by name, email, phone or company')} value={filters.q} onSearch={onSearch} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Field label={t('crm.contacts.field.lifecycle_status', 'Lifecycle')}>
          <Select value={filters.lifecycle} onChange={e => update('lifecycle', e.target.value)}>
            <option value="">{t('crm.common.all', 'All')}</option>
            {optionsWith(lists.lifecycle, filters.lifecycle).map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.contacts.field.importance', 'Importance')}>
          <Select value={filters.importance} onChange={e => update('importance', e.target.value)}>
            <option value="">{t('crm.common.all', 'All')}</option>
            {optionsWith(lists.importance, filters.importance).map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.contacts.field.lead_source', 'Source')}>
          <Select value={filters.source} onChange={e => update('source', e.target.value)}>
            <option value="">{t('crm.common.all', 'All')}</option>
            {optionsWith(facets.data?.lead_source ?? [], filters.source).map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.contacts.field.country', 'Country')}>
          <Select value={filters.country} onChange={e => update('country', e.target.value)}>
            <option value="">{t('crm.common.all', 'All')}</option>
            {optionsWith(facets.data?.country ?? [], filters.country).map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.contacts.tag', 'Tag')}>
          <Select value={filters.tag} onChange={e => update('tag', e.target.value)}>
            <option value="">{t('crm.common.all', 'All')}</option>
            {(tags.data ?? []).map(tag => <option key={tag.id} value={String(tag.id)}>{tag.name}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.contacts.sort', 'Order')}>
          <Select value={filters.sort} onChange={e => update('sort', e.target.value === 'newest' ? null : e.target.value)}>
            {SORT_KEYS.map(key => <option key={key} value={key}>{t(`crm.contacts.sorts.${key}`, SORT_FALLBACK[key])}</option>)}
          </Select>
        </Field>
      </div>

      <SavedViews filters={filters} />

      {filters.company && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-a-border bg-a-surface-2 px-3 py-2 text-sm text-a-text">
          <Building2 size={15} aria-hidden className="text-a-text-2" />
          <span className="min-w-0 flex-1">{t('crm.contacts.at_company', 'People at {{company}}', { company: filters.company })}</span>
          <Button variant="ghost" size="sm" onClick={() => update('company', null)}><X size={14} aria-hidden />{t('crm.contacts.show_everyone', 'Show everyone')}</Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm text-a-text-2" aria-live="polite">
          {list.data ? t('crm.common.total', '{{count}} in all', { count: list.data.total }) : ''}
          {tagName ? ` · ${tagName}` : ''}
        </p>
        {narrowed && <Button variant="ghost" size="sm" onClick={() => setSearch(prev => withoutFilters(prev), { replace: true })}>{t('crm.contacts.clear_filters', 'Clear filters')}</Button>}
        <Button variant="secondary" size="sm" onClick={() => { void exportCsv([]) }} loading={exporting && selected.length === 0} disabled={!list.data || list.data.total === 0}>
          <Download size={14} aria-hidden />{t('crm.contacts.export', 'Export CSV')}
        </Button>
      </div>

      {selected.length > 0 && (
        <BulkBar ids={selected} lists={lists} onClear={() => setSelected([])} onExport={() => { void exportCsv(selected) }} exporting={exporting} />
      )}

      <QueryState loading={list.isLoading} error={list.error} onRetry={() => { void list.refetch() }}>
        {rows.length === 0 ? (
          <Card>
            {narrowed
              ? <EmptyState icon={Users} title={t('crm.contacts.none_match', 'Nobody matches these filters')}
                  action={<Button variant="secondary" onClick={() => setSearch(prev => withoutFilters(prev), { replace: true })}>{t('crm.contacts.clear_filters', 'Clear filters')}</Button>} />
              : <EmptyState icon={Users} title={t('crm.contacts.empty', 'No contacts yet')}
                  line={t('crm.contacts.empty_line', 'People who leave their details in the chat or come in as leads appear here. You can add one yourself too.')}
                  action={<Button onClick={onAdd}><Plus size={15} aria-hidden />{t('crm.contacts.add', 'Add contact')}</Button>} />}
          </Card>
        ) : (
          <Card padded={false}>
            <div className="flex items-center gap-3 border-b border-a-border px-4 py-2.5">
              <input type="checkbox" className="h-4 w-4 accent-a-accent" checked={allOnPage(selected, pageIds)}
                onChange={() => setSelected(prev => togglePage(prev, pageIds))}
                aria-label={t('crm.contacts.choose_page', 'Choose every contact on this page')} />
              <span className="flex-1 text-xs font-medium text-a-text-2">{t('crm.contacts.name', 'Contact')}</span>
              <span className="hidden w-56 text-xs font-medium text-a-text-2 lg:block">{t('crm.contacts.reach', 'Email and phone')}</span>
              <span className="hidden w-40 text-xs font-medium text-a-text-2 md:block">{t('crm.contacts.standing', 'Standing')}</span>
              <span className="hidden w-24 text-right text-xs font-medium text-a-text-2 md:block">{t('crm.contacts.added_when', 'Added')}</span>
            </div>
            <ul className="divide-y divide-a-border">
              {rows.map(row => {
                const name = displayName(row) ?? t('crm.common.no_name', 'No name')
                const chosen = selected.includes(row.id)
                return (
                  <li key={row.id} className={`flex items-center gap-3 px-4 py-3 ${chosen ? 'bg-a-accent/8' : ''}`}>
                    <input type="checkbox" className="h-4 w-4 shrink-0 accent-a-accent" checked={chosen} onChange={() => setSelected(prev => toggleId(prev, row.id))}
                      aria-label={t('crm.contacts.choose', 'Choose {{name}}', { name })} />
                    <Link to={contactPath(row.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-2 focus-visible:outline-a-accent">
                      <Avatar name={name} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-a-text hover:underline">{name}</span>
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
                    <span className="hidden w-24 text-right text-xs text-a-text-2 md:block">{timeAgo(row.created_at, lang)}</span>
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
  if (views.length === 0 && !canSave) return null

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-a-text-2"><Bookmark size={13} aria-hidden />{t('crm.contacts.views', 'Saved views')}</span>
      {views.map(view => (
        <span key={view.id} className="inline-flex items-center rounded-full border border-a-border bg-a-surface text-sm">
          <button type="button" className="min-h-9 rounded-l-full py-1 pl-3 pr-1.5 text-a-text hover:text-a-accent-text"
            onClick={() => setSearch(prev => withSegment(prev, view.filters), { replace: true })}>
            {view.name}
          </button>
          <button type="button" className="grid min-h-9 place-items-center rounded-r-full px-2 text-a-text-2 hover:text-a-danger"
            aria-label={t('crm.contacts.remove_view', 'Remove the view {{name}}', { name: view.name })} onClick={() => setRemoving(view)}>
            <X size={13} aria-hidden />
          </button>
        </span>
      ))}
      {canSave && (
        <Button variant="ghost" size="sm" onClick={() => setNaming(true)}><Plus size={14} aria-hidden />{t('crm.contacts.save_view', 'Save this view')}</Button>
      )}

      {naming && (
        <Dialog title={t('crm.contacts.save_view', 'Save this view')} onClose={() => setNaming(false)} busy={save.isPending}>
          <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (name.trim()) save.mutate() }}>
            <p className="text-sm text-a-text-2">{t('crm.contacts.save_view_line', 'Keep these filters under a name, to open them again with one press.')}</p>
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
    </div>
  )
}

/** Many contacts at once: set their lifecycle or importance, export them, or delete them (asked first). */
function BulkBar({ ids, lists, onClear, onExport, exporting }: {
  ids: number[]
  lists: { lifecycle: string[]; importance: string[] }
  onClear: () => void
  onExport: () => void
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

  const options = field === 'lifecycle_status' ? lists.lifecycle : lists.importance
  return (
    <section aria-label={t('crm.contacts.bulk', 'Change the chosen contacts')} className="space-y-3 rounded-2xl border border-a-accent/30 bg-a-accent/8 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="mr-auto text-sm font-semibold text-a-text">{t('crm.contacts.chosen', '{{count}} chosen', { count: ids.length })}</p>
        <Button variant="ghost" size="sm" onClick={onClear}>{t('crm.contacts.clear_choice', 'Clear')}</Button>
        <Button variant="secondary" size="sm" onClick={onExport} loading={exporting}><Download size={14} aria-hidden />{t('crm.contacts.export', 'Export CSV')}</Button>
        {boot.staff.can.delete_records && (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)} disabled={tooMany}><Trash2 size={14} aria-hidden />{t('crm.common.delete', 'Delete')}</Button>
        )}
      </div>
      {tooMany && <Notice tone="warning">{t('crm.contacts.too_many', 'Choose at most {{max}} contacts at a time.', { max: BULK_MAX })}</Notice>}
      <form className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-end" onSubmit={e => { e.preventDefault(); if (body) apply.mutate() }}>
        <Field label={t('crm.contacts.bulk_set', 'Set')}>
          <Select value={field} onChange={e => { setField(e.target.value as BulkField); setValue('') }}>
            {BULK_FIELDS.map(key => <option key={key} value={key}>{key === 'lifecycle_status' ? t('crm.contacts.field.lifecycle_status', 'Lifecycle') : t('crm.contacts.field.importance', 'Importance')}</option>)}
          </Select>
        </Field>
        <Field label={t('crm.contacts.bulk_to', 'To')}>
          <Select value={value} onChange={e => setValue(e.target.value)}>
            <option value="">{t('crm.contacts.bulk_pick', 'Choose…')}</option>
            {options.map(v => <option key={v} value={v}>{v}</option>)}
          </Select>
        </Field>
        <Button type="submit" disabled={!body} loading={apply.isPending}>{t('crm.contacts.bulk_apply', 'Apply')}</Button>
      </form>

      {confirming && (
        <Confirm title={t('crm.contacts.bulk_delete_title', 'Delete the chosen contacts ({{count}})?', { count: ids.length })} confirm={t('crm.common.delete', 'Delete')}
          busy={remove.isPending} onConfirm={() => remove.mutate()} onClose={() => setConfirming(false)}>
          {t('crm.contacts.bulk_delete_line', 'Their leads and timelines are deleted with them. This cannot be undone.')}
        </Confirm>
      )}
    </section>
  )
}
