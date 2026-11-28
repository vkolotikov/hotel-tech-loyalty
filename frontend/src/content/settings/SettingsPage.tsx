import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useApi, useBoot, useBrandId } from '../ContentProvider'
import { useRetainedState } from '../drafts/useRetainedState'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../ui/PageHeader'
import type { PlanningSettings } from '../lib/launchTypes'
import { CollaborationEmailSwitch } from './CollaborationEmailSwitch'

export function PlanningForm({ settings }: { settings: PlanningSettings }) {
  const api = useApi(), boot = useBoot(), client = useQueryClient(), { t } = useTranslation()
  const [zone, setZone, retained] = useRetainedState('planning-zone', settings.timezone_named ? settings.timezone : '')
  const authoritativeZone = settings.timezone_named ? settings.timezone : ''
  const { adoptIfClean } = retained
  useEffect(() => { adoptIfClean(authoritativeZone) }, [adoptIfClean, authoritativeZone])
  const [busy, setBusy] = useRetainedState('planning-zone-busy', false)
  const [failed, setFailed] = useState(false), [saved, setSaved] = useState(false)
  const save = async () => {
    setBusy(true); setFailed(false); setSaved(false)
    try { await api.saveSettings(zone); retained.acknowledge(zone); await client.invalidateQueries(); setSaved(true) }
    catch { setFailed(true) } finally { setBusy(false) }
  }
  return <section className="c-settings-card space-y-4">
    <h2 className="font-a-display text-xl text-a-text">{t('content.launch.planning_zone', 'Planning time zone')}</h2>
    <p className="text-sm text-a-text-2">{t('content.launch.zone_consequence', 'This is the shared account clock for Content plans, reminders and morning emails, appointments, the member portal and dashboards. Existing dates and times keep their written digits; they are not moved.')}</p>
    {!settings.timezone_named && <Notice tone="info">{t('content.launch.zone_unset', 'The planning clock uses UTC. Choose a time zone for your account.')}</Notice>}
    <label className="block text-sm text-a-text">{t('content.launch.planning_zone', 'Planning time zone')}<select className="c-launch-input mt-1" disabled={!boot.staff.can_manage || busy} value={zone} onChange={e => setZone(e.target.value)}><option value="">{t('content.launch.choose_zone', 'Choose a time zone')}</option>{settings.timezones.map(z => <option key={z} value={z}>{z}</option>)}</select></label>
    {boot.staff.can_manage && <Button disabled={!zone} loading={busy} onClick={() => { void save() }}>{t('content.launch.save_zone', 'Save account time zone')}</Button>}
    {failed && <Notice tone="danger">{t('content.common.error', 'Something went wrong. Please try again.')}</Notice>}
    {saved && <Notice tone="success">{t('content.panel.saved', 'Saved')}</Notice>}
  </section>
}
export function SettingsPage() {
  const api = useApi(), brand = useBrandId(), { t } = useTranslation()
  const query = useQuery({ queryKey: ['content', brand, 'settings'], queryFn: api.settings })
  return <div className="space-y-5 p-4 lg:p-6"><PageHeader title={t('content.launch.settings', 'Content settings')} /><CollaborationEmailSwitch />{query.data && <PlanningForm settings={query.data} />}{query.isLoading && <p role="status">{t('content.common.loading', 'Loading…')}</p>}{query.isError && <Button onClick={() => { void query.refetch() }}>{t('content.common.retry', 'Try again')}</Button>}</div>
}
