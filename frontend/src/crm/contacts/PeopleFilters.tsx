import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AtSign, Crown, Phone, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { Field } from '../../workspace/ui/Field'
import { Select, TextInput } from '../ui/inputs'
import { Popover } from '../ui/Menu'
import { activeFilterCount, optionsWith, type PeopleFilters } from './contactsLogic'
import { useFacets, type ContactLists } from './queries'
import type { GuestTag } from './types'

/**
 * Every filter of the people list in one panel behind the toolbar's Filters button (round 5: a phone's first screen is
 * the list, not the filters): the venue's lists and the values the organisation's contacts hold (`guests/facets`), the
 * company, the days they were added (the venue's days), and three switches — VIP, has an email, has a phone. Each
 * applies at once; the chips under the toolbar say what is on.
 */
export function PeopleFiltersPanel({ filters, lists, tags, onSet, onClear }: {
  filters: PeopleFilters
  lists: ContactLists
  tags: GuestTag[]
  onSet: (key: string, value: string | null) => void
  onClear: () => void
}) {
  const { t } = useTranslation()
  const facets = useFacets()
  const on = activeFilterCount(filters, { withSearch: false })
  const all = t('crm.common.all', 'All')
  const pick = (key: keyof PeopleFilters, label: string, options: string[]) => (
    <Field label={label}>
      <Select value={filters[key]} onChange={e => onSet(key, e.target.value || null)} className={filters[key] ? 'ring-1 ring-a-accent/60' : ''}>
        <option value="">{all}</option>
        {optionsWith(options, filters[key]).map(v => <option key={v} value={v}>{v}</option>)}
      </Select>
    </Field>
  )
  const label = t('crm.contacts.filters', 'Filters')
  return (
    <Popover label={label} align="right" width="w-[22rem]"
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border bg-a-surface px-3 text-sm font-medium hover:bg-a-surface-2 focus-visible:outline-2 focus-visible:outline-a-accent ${on > 0 ? 'border-a-accent/60 text-a-text' : 'border-a-border text-a-text-2'}`}
      button={<>
        <SlidersHorizontal size={15} aria-hidden />
        <span>{label}</span>
        {on > 0 && <span className="rounded-full bg-a-accent px-1.5 text-xs font-semibold leading-5 text-a-accent-ink">{on}</span>}
      </>}>
      <div className="max-h-[min(36rem,70vh)] space-y-3 overflow-y-auto p-1.5">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
          <Switch icon={Crown} on={filters.vip === '1'} onToggle={next => onSet('vip', next ? '1' : null)}>{t('crm.contacts.chip.vip', 'VIP')}</Switch>
          <Switch icon={AtSign} on={filters.email === '1'} onToggle={next => onSet('email', next ? '1' : null)}>{t('crm.contacts.chip.email', 'Has email')}</Switch>
          <Switch icon={Phone} on={filters.phone === '1'} onToggle={next => onSet('phone', next ? '1' : null)}>{t('crm.contacts.chip.phone', 'Has phone')}</Switch>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {pick('lifecycle', t('crm.contacts.field.lifecycle_status', 'Lifecycle'), lists.lifecycle)}
          {pick('importance', t('crm.contacts.field.importance', 'Importance'), lists.importance)}
          {pick('gtype', t('crm.contacts.field.guest_type', 'Type'), facets.data?.guest_type?.length ? facets.data.guest_type : lists.guestTypes)}
          <Field label={t('crm.contacts.tag', 'Tag')}>
            <Select value={filters.tag} onChange={e => onSet('tag', e.target.value || null)} className={filters.tag ? 'ring-1 ring-a-accent/60' : ''}>
              <option value="">{all}</option>
              {tags.map(tag => <option key={tag.id} value={String(tag.id)}>{tag.name}</option>)}
            </Select>
          </Field>
          {pick('source', t('crm.contacts.field.lead_source', 'Source'), facets.data?.lead_source ?? [])}
          {pick('owner', t('crm.contacts.field.owner_name', 'Owner'), facets.data?.owner_name ?? [])}
          {pick('country', t('crm.contacts.field.country', 'Country'), facets.data?.country ?? [])}
          {pick('nationality', t('crm.contacts.field.nationality', 'Nationality'), facets.data?.nationality ?? [])}
        </div>
        <Field label={t('crm.contacts.field.company', 'Company')}>
          <CommitInput value={filters.co} onCommit={value => onSet('co', value)} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('crm.contacts.added_from', 'Added from')}>
            <TextInput type="date" value={filters.from} max={filters.to || undefined} onChange={e => onSet('from', e.target.value || null)} />
          </Field>
          <Field label={t('crm.contacts.added_to', 'Added until')}>
            <TextInput type="date" value={filters.to} min={filters.from || undefined} onChange={e => onSet('to', e.target.value || null)} />
          </Field>
        </div>
        {on > 0 && (
          <button type="button" data-close onClick={onClear}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-a-accent-text hover:bg-a-accent/10 focus-visible:outline-2 focus-visible:outline-a-accent">
            <X size={14} aria-hidden />{t('crm.contacts.clear_filters', 'Clear filters')}
          </button>
        )}
      </div>
    </Popover>
  )
}

/** A switch drawn as a pill with its icon (pressed: on). */
function Switch({ icon: Icon, on, onToggle, children }: { icon: LucideIcon; on: boolean; onToggle: (next: boolean) => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={() => onToggle(!on)}
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-a-accent ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text-2 hover:text-a-text'}`}>
      <Icon size={14} aria-hidden />{children}
    </button>
  )
}

/** A text filter applied when the person is done typing (Enter, or leaving the box), not at every key. */
function CommitInput({ value, onCommit }: { value: string; onCommit: (value: string | null) => void }) {
  const [text, setText] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setText(value)
  }
  const commit = () => { if (text.trim() !== value.trim()) onCommit(text.trim() || null) }
  return (
    <TextInput value={text} onChange={e => setText(e.target.value)} onBlur={commit} autoComplete="off"
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit() } }} />
  )
}
