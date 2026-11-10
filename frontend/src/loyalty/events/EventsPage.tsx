import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { timeOf, dateOf } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { points } from '../lib/format'
import { FormField } from '../ui/formParts'
import { Pager } from '../ui/Pager'
import { OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { ManagementColumns, ManagementHeading, ManagementLabels, ManagementPanel } from '../management/ManagementUI'
import { focusManagementSelection } from '../management/selection'
import { EVENTS_KEY, eventsApi } from './eventsApi'
import { EVENT_TABS, tabFrom, whereOf } from './eventsMath'
import { TAB_WORDS } from './words'
import { EventDetails, EventIcon, EventRow } from './design/EventUI'
import { useEventWords } from './design/words'
import { eventRowStatus } from './design/math'

/** One Events destination; status and catalogue filters stay with the list. */
export function EventsPage() {
  const { t, i18n } = useTranslation(), say = useEventWords(), boot = useBoot()
  const [params, setParams] = useSearchParams(), tab = tabFrom(`?${params}`)
  const latestParams = useRef(params)
  useEffect(() => { latestParams.current = params }, [params])
  const page = Math.max(1, Number(params.get('page')) || 1)
  const filters = Object.fromEntries(['q', 'place_id', 'location', 'tier_id', 'sort'].flatMap(k => params.get(k) ? [[k, params.get(k)!]] : []))
  const query = useQuery({ queryKey: [...EVENTS_KEY, tab, page, ...(Object.keys(filters).length ? [filters] : [])], queryFn: () => eventsApi.list(tab, page, filters) })
  const data = query.data, selected = data?.events.find(e => String(e.id) === params.get('selected')) ?? data?.events[0]
  const change = (patch: Record<string, string>, paging = false) => {
    const next = new URLSearchParams(latestParams.current)
    if (!paging) { next.delete('page'); next.delete('selected') }
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k) }
    latestParams.current = next
    setParams(next, { replace: true })
  }
  const filtered = ['q', 'place_id', 'location', 'tier_id'].some(k => filters[k])
  const location = filters.place_id ? `place:${filters.place_id}` : filters.location ? `text:${filters.location}` : ''
  return <div className="l-ad-page l-ec-page">
    <ManagementHeading title={t('loyalty.events.title', 'Events')} line={say('compactLine')}>
      {data?.can_change && <Link className="l-ov-button l-ov-primary" to={`/loyalty/events/new?${params}`}><Plus size={16} aria-hidden />{say('createTitle')}</Link>}
    </ManagementHeading>
    {query.isError && <OverviewRecovery onRetry={query.refetch} busy={query.isFetching} />}
    {!data && query.isLoading && <OverviewSkeleton rows={4} />}
    {data && <ManagementColumns><ManagementPanel title={say('directory')} count={say('eventCount', { n: points(data.total, i18n.language) })} className="l-ec-directory">
      <nav className="l-ec-tabs" aria-label={t('loyalty.events.tabs', 'Events')}>{EVENT_TABS.map(k => <button key={k} type="button" aria-pressed={tab === k} onClick={() => change({ tab: k, sort: '' })}>{t(`loyalty.events.tab.${k}`, TAB_WORDS[k])}<span>{points(data.totals[k], i18n.language)}</span></button>)}</nav>
      <div className="l-ec-filters">
        <FormField label={say('search')}><input type="search" maxLength={120} value={filters.q ?? ''} placeholder={say('searchHint')} onChange={e => change({ q: e.target.value })} /></FormField>
        <FormField label={say('location')}><select value={location} onChange={e => change({ place_id: e.target.value.startsWith('place:') ? e.target.value.slice(6) : '', location: e.target.value.startsWith('text:') ? e.target.value.slice(5) : '' })}><option value="">{say('allLocations')}</option>{data.options.places.map(p => <option key={p.id} value={`place:${p.id}`}>{p.name}</option>)}{data.options.locations?.map(p => <option key={p} value={`text:${p}`}>{p}</option>)}</select></FormField>
        <FormField label={say('level')}><select value={filters.tier_id ?? ''} onChange={e => change({ tier_id: e.target.value })}><option value="">{say('allLevels')}</option>{boot.programme.tiers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField>
      </div>
      <div className="l-ec-list-tools"><span>{say(tab)}</span><select aria-label={say('sort')} value={filters.sort ?? (tab === 'past' ? 'latest' : 'soonest')} onChange={e => change({ sort: e.target.value })}><option value="soonest">{say('soonest')}</option><option value="latest">{say('latest')}</option></select></div>
      {!data.events.length ? <div className="l-ec-empty"><EventIcon kind="calendar" /><h3>{filtered ? say('noResults') : tab === 'upcoming' ? t('loyalty.events.get_started.title', 'Plan your first event') : t(`loyalty.events.empty.${tab}`, tab === 'past' ? 'Events that have ended show here, with who came.' : 'No drafts. An event saved as a draft stays here until you publish it.')}</h3>{filtered && <button type="button" className="l-ov-link" onClick={() => change({ q: '', place_id: '', location: '', tier_id: '' })}>{say('clear')}</button>}</div> : <>
        <ManagementLabels first={say('eventSchedule')} value={say('signups')} status={say('status')} />
        <ul className="l-ec-rows">{data.events.map(e => { const status = eventRowStatus(e); return <EventRow key={e.id} id={e.id} event={e} selected={e.id === selected?.id} onSelect={() => { change({ selected: String(e.id) }, true); focusManagementSelection() }} name={e.title} caption={`${dateOf(e.starts_at) === dateOf(e.ends_at) ? `${timeOf(e.starts_at)}–${timeOf(e.ends_at)}` : say('multiple')}${whereOf(e) ? ` · ${whereOf(e)}` : ''}`} value={e.sign_up ? `${points(e.counts.signed_up, i18n.language)}${e.capacity === null ? '' : ` / ${points(e.capacity, i18n.language)}`}` : say('notRequired')} status={say(status.word)} tone={status.tone} /> })}</ul>
      </>}
      <Pager page={data.page} pages={data.pages} onPage={n => change({ page: String(n), selected: '' }, true)} />
      <div className="l-ec-list-footer"><small>{say('zone', { zone: boot.venue.timezone })}</small><Link className="l-ov-link" to="/loyalty/options?tab=bonus"><EventIcon kind="boost" />{say('boosts')}</Link></div>
    </ManagementPanel>{selected && <EventDetails event={selected} canChange={data.can_change} />}</ManagementColumns>}
    {data && !data.can_change && <p className="l-ec-hint">{t('loyalty.events.read_only', 'Managers and staff allowed to manage offers create events.')}</p>}
  </div>
}
