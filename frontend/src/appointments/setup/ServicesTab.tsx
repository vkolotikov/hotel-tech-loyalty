import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { money } from '../../lib/money'
import type { SetupCategory, SetupPayload, SetupService } from '../lib/types'
import { Button } from '../ui/Button'
import { ServiceEditor } from './ServiceEditor'

export interface ServiceGroup { key: string; name: string; services: SetupService[] }

/** Services by category, in the categories' own order, then the uncategorised; inactive ones only when asked for. */
// eslint-disable-next-line react-refresh/only-export-components
export function groupServices(services: SetupService[], categories: SetupCategory[], search: string, showInactive: boolean, otherLabel: string): ServiceGroup[] {
  const term = search.trim().toLowerCase()
  const shown = services.filter(s => (showInactive || s.is_active) && (term === '' || s.name.toLowerCase().includes(term)))
  const known = new Set(categories.map(c => c.id))
  const groups: ServiceGroup[] = categories.map(c => ({ key: `c${c.id}`, name: c.name, services: shown.filter(s => s.category_id === c.id) }))
  groups.push({ key: 'other', name: otherLabel, services: shown.filter(s => s.category_id === null || !known.has(s.category_id)) })
  return groups.filter(g => g.services.length > 0)
}

export function ServicesTab({ data, refresh }: { data: SetupPayload; refresh: () => void }) {
  const { t } = useTranslation()
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [editing, setEditing] = useState<SetupService | 'new' | null>(null)
  const otherLabel = t('appointments.setup.services.no_category', 'Other')
  const groups = useMemo(() => groupServices(data.services, data.categories, search, showInactive, otherLabel), [data, search, showInactive, otherLabel])

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="min-w-[12rem] flex-1">
          <span className="sr-only">{t('appointments.setup.services.search', 'Search services')}</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('appointments.setup.services.search', 'Search services')}
            className="w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text placeholder:text-a-text-2" />
        </label>
        <label className="flex items-center gap-2 text-sm text-a-text-2">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
          {t('appointments.setup.show_inactive', 'Show inactive')}
        </label>
        {data.can_manage && (
          <Button onClick={() => setEditing('new')}><Plus size={16} aria-hidden /> {t('appointments.setup.services.new', 'New service')}</Button>
        )}
      </div>

      {groups.length === 0 && <p className="text-sm text-a-text-2">{t('appointments.setup.none_yet', 'Nothing here yet.')}</p>}
      {groups.map(group => (
        <section key={group.key} aria-labelledby={`services-${group.key}`} className="space-y-2">
          <h2 id={`services-${group.key}`} className="text-sm font-semibold text-a-text-2">{group.name}</h2>
          <ul className="divide-y divide-a-border rounded-lg border border-a-border bg-a-surface">
            {group.services.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => setEditing(s)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-a-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-a-text">{s.name}</span>
                    <span className="block text-xs text-a-text-2">
                      {t('appointments.setup.services.minutes', '{{count}} min', { count: s.duration_minutes })} · {money(s.price, s.currency)}
                      {!s.is_active && ` · ${t('appointments.setup.inactive', 'Inactive')}`}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {editing !== null && (
        <ServiceEditor service={editing === 'new' ? null : editing} data={data}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh() }} />
      )}
    </div>
  )
}
