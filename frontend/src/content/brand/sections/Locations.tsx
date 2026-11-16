import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot, useBrandId } from '../../ContentProvider'
import { useRetainedState } from '../../drafts/useRetainedState'
import type { ContentLocation } from '../../lib/launchTypes'
import { Button } from '../../../workspace/ui/Button'
import { Notice } from '../../../workspace/ui/Notice'

const EMPTY: Omit<ContentLocation, 'id'> = { name: '', address: '', city: '', country: '', timezone: 'UTC', email: '', phone: '', website: '', is_active: true }
function LocationForm({ target, row, zones, onDone }: { target: number | 'new'; row: ContentLocation | null; zones: string[]; onDone: () => void }) {
  const api = useApi(), brand = useBrandId(), client = useQueryClient(), { t } = useTranslation()
  const [form, setForm, retained] = useRetainedState(`location:${target}`, () => { if (!row) return EMPTY; return { name: row.name, address: row.address, city: row.city, country: row.country, timezone: row.timezone, email: row.email, phone: row.phone, website: row.website, is_active: row.is_active } })
  const [busy, setBusy] = useRetainedState(`location-busy:${target}`, false), [error, setError] = useState(false)
  const save = async () => { setBusy(true); setError(false); try { await api.saveLocation(target === 'new' ? null : target, form); await client.invalidateQueries({ queryKey: ['content', brand] }); retained.clear(); onDone() } catch { setError(true) } finally { setBusy(false) } }
  const fields = ['name', 'address', 'city', 'country', 'email', 'phone', 'website'] as const
  const names = ['Name', 'Address', 'City', 'Country', 'Email', 'Phone', 'Website']
  return <fieldset disabled={busy} className="c-settings-card space-y-4"><div className="grid gap-3 sm:grid-cols-2">{fields.map((key, i) => <label key={key} className="block text-sm text-a-text">{t(`content.launch.location_${key}`, names[i])}<input className="c-launch-input mt-1" type={key === 'email' ? 'email' : key === 'website' ? 'url' : 'text'} maxLength={key === 'address' ? 2000 : key === 'phone' ? 20 : key === 'city' || key === 'country' ? 100 : key === 'website' ? 250 : 255} value={form[key] ?? ''} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}</div>
    <label className="block text-sm text-a-text">{t('content.launch.location_zone', 'Location time zone')}<select className="c-launch-input" value={form.timezone} onChange={e => setForm({ ...form, timezone: e.target.value })}>{['UTC', ...zones].map(zone => <option key={zone}>{zone}</option>)}</select></label>
    <p className="text-sm text-a-text-2">{t('content.launch.location_clock', 'Location changes do not change the account planning clock. Inactive locations still count toward your plan.')}</p>
    <label className="flex gap-2 text-sm text-a-text"><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} />{t('content.launch.active', 'Active')}</label>
    {error && <Notice tone="danger">{t('content.launch.location_failed', 'The location could not be saved. Check the fields and your plan’s location allowance.')}</Notice>}
    <div className="flex gap-2"><Button loading={busy} disabled={!form.name.trim()} onClick={() => { void save() }}>{t('content.brand.save', 'Save')}</Button><Button variant="secondary" onClick={() => { retained.clear(); onDone() }}>{t('content.common.cancel', 'Cancel')}</Button></div>
  </fieldset>
}
export function LocationsSection() {
  const api = useApi(), brand = useBrandId(), boot = useBoot(), { t } = useTranslation()
  const query = useQuery({ queryKey: ['content', brand, 'locations'], queryFn: api.locations })
  const settings = useQuery({ queryKey: ['content', brand, 'settings'], queryFn: api.settings })
  const [open, setOpen] = useRetainedState<number | 'new' | null>('locations-open', null, false)
  const row = typeof open === 'number' ? query.data?.locations.find(location => location.id === open) : null
  const unresolved = typeof open === 'number' && !row
  const full = settings.data?.locations_limit !== null && settings.data?.locations_limit !== undefined && settings.data.locations_used >= settings.data.locations_limit
  return <section className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><h2 className="font-a-display text-xl text-a-text">{t('content.launch.locations', 'Locations')}</h2>{boot.staff.can_manage && <Button disabled={full} onClick={() => setOpen('new')}>{t('content.launch.add_location', 'Add location')}</Button>}</div>
    {settings.data && <p className="text-sm text-a-text-2">{t('content.launch.location_count', '{{used}} locations across this account', { used: settings.data.locations_used })}{settings.data.locations_limit !== null ? ` / ${settings.data.locations_limit}` : ''}</p>}
    {unresolved && <div className="space-y-3">
      {query.isPending || query.isFetching
        ? <p role="status">{t('content.common.loading', 'Loading…')}</p>
        : <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>}
      {!query.isFetching && <Button onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>}
      <Button variant="secondary" onClick={() => setOpen(null)}>{t('content.common.cancel', 'Cancel')}</Button>
    </div>}
    {query.isError && !unresolved && <Button onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>}
    {open !== null && !unresolved && <LocationForm key={open} target={open} row={row ?? null} zones={settings.data?.timezones ?? []} onDone={() => setOpen(current => current === open ? null : current)} />}
    {query.data?.locations.map(row => <article key={row.id} className="c-settings-card flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-a-text font-medium">{row.name}</h3><p className="text-sm text-a-text-2">{[row.address, row.city, row.country].filter(Boolean).join(', ')}</p><p className="text-xs text-a-text-2">{row.timezone} · {row.is_active ? t('content.launch.active', 'Active') : t('content.launch.inactive', 'Inactive')}</p></div>{boot.staff.can_manage && <Button variant="secondary" onClick={() => setOpen(row.id)}>{t('content.brand.edit', 'Edit')}</Button>}</article>)}
  </section>
}
