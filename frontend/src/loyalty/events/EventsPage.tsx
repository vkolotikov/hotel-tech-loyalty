import { useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { dateOf, formatDate, timeOf } from '../../workspace/lib/wallClock'
import { useBoot } from '../LoyaltyProvider'
import { points } from '../lib/format'
import { FormField } from '../ui/formParts'
import { Pager } from '../ui/Pager'
import { OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { EVENTS_KEY, eventsApi } from './eventsApi'
import { EVENT_TABS, tabFrom, whereOf } from './eventsMath'
import { PHASE_WORDS, TAB_WORDS } from './words'
import { EventDetails, EventEyebrow, EventHeading, EventRow } from './design/EventUI'
import { useEventWords } from './design/words'

export function EventsPage() {
  const { t, i18n } = useTranslation(), say = useEventWords(), boot = useBoot()
  const [params, setParams] = useSearchParams(), tab = tabFrom(`?${params}`)
  const latestParams = useRef(params)
  latestParams.current = params
  const page = Math.max(1, Number(params.get('page')) || 1)
  const filters = Object.fromEntries(['q', 'place_id', 'location', 'tier_id', 'sort'].flatMap(k => params.get(k) ? [[k, params.get(k)!]] : []))
  const query = useQuery({ queryKey: [...EVENTS_KEY, tab, page, ...(Object.keys(filters).length ? [filters] : [])], queryFn: () => eventsApi.list(tab, page, filters) })
  const data = query.data, selected = data?.events.find(e => String(e.id) === params.get('selected')) ?? data?.events[0]
  const change = (patch: Record<string, string>, paging = false) => { const next = new URLSearchParams(latestParams.current); if (!paging) { next.delete('page'); next.delete('selected') }; for (const [k,v] of Object.entries(patch)) { if (v) next.set(k,v); else next.delete(k) }; latestParams.current = next; setParams(next, { replace: true }) }
  const location = filters.place_id ? `place:${filters.place_id}` : filters.location ? `text:${filters.location}` : ''
  return <div className="l-ov-page l-rd-page l-ev-page">
    <EventHeading title={t('loyalty.events.title', 'Events')} line={say('line')}><Link className="l-ov-button" to="/loyalty/guide">{t('loyalty.overview.help', 'Help & guide')}</Link>{data?.can_change && <Link className="l-ov-button l-ov-primary" to="/loyalty/events/new">{say('create')}</Link>}</EventHeading>
    <nav className="l-ev-tabs" aria-label={t('loyalty.events.tabs', 'Events')}>{EVENT_TABS.map(k => <Link key={k} to={`/loyalty/events?tab=${k}`} aria-current={tab === k ? 'page' : undefined}>{t(`loyalty.events.tab.${k}`, TAB_WORDS[k])}</Link>)}</nav>
    <section className="l-ev-hero"><div><h2>{say('hero')}</h2><p>{say('heroLine')}</p></div>{data && <small>{say('upcomingCount', { n: points(data.totals.upcoming, i18n.language) })}</small>}</section>
    <div className="l-ev-filters"><FormField label={say('search')}><input type="search" maxLength={120} value={filters.q ?? ''} placeholder={say('searchHint')} onChange={e => change({ q: e.target.value })} /></FormField><FormField label={say('location')}><select value={location} onChange={e => change({ place_id: e.target.value.startsWith('place:') ? e.target.value.slice(6) : '', location: e.target.value.startsWith('text:') ? e.target.value.slice(5) : '' })}><option value="">{say('allLocations')}</option>{data?.options.places.map(p => <option key={p.id} value={`place:${p.id}`}>{p.name}</option>)}{data?.options.locations?.map(p => <option key={p} value={`text:${p}`}>{p}</option>)}</select></FormField><FormField label={say('level')}><select value={filters.tier_id ?? ''} onChange={e => change({ tier_id: e.target.value })}><option value="">{say('allLevels')}</option>{boot.programme.tiers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></FormField></div>
    {query.isError && <OverviewRecovery onRetry={query.refetch} busy={query.isFetching} />}{!data && query.isLoading && <OverviewSkeleton rows={4} />}
    {data && <div className="l-ev-columns"><div className="l-ev-stack"><section className="l-ov-panel l-ev-list"><div className="l-ev-list-heading"><h2>{say(tab)}</h2><select aria-label={t('loyalty.common.sort', 'Sort')} value={filters.sort ?? (tab === 'past' ? 'latest' : 'soonest')} onChange={e => change({ sort: e.target.value })}><option value="soonest">{say('soonest')}</option><option value="latest">{say('latest')}</option></select></div>
      {!data.events.length && <div className="l-ev-empty"><p>{Object.keys(filters).some(k => k !== 'sort') ? say('noResults') : tab === 'upcoming' ? t('loyalty.events.get_started.title', 'Plan your first event') : t(`loyalty.events.empty.${tab}`, tab === 'past' ? 'Events that have ended show here, with who came.' : 'No drafts. An event saved as a draft stays here until you publish it.')}</p>{Object.keys(filters).some(k => k !== 'sort') && <button type="button" className="l-ov-link" onClick={() => change({ q: '', place_id: '', location: '', tier_id: '' })}>{say('clear')}</button>}</div>}
      <ul>{data.events.map(e => <EventRow key={e.id} id={e.id} selected={e.id === selected?.id} onSelect={() => change({ selected: String(e.id) }, true)} name={`${formatDate(dateOf(e.starts_at), i18n.language, { day: '2-digit', month: 'short' })}${dateOf(e.starts_at) !== dateOf(e.ends_at) ? `–${formatDate(dateOf(e.ends_at), i18n.language, { day: '2-digit', month: 'short' })}` : ''} · ${e.title}`} caption={`${dateOf(e.starts_at) === dateOf(e.ends_at) ? `${timeOf(e.starts_at)}–${timeOf(e.ends_at)}` : say('multiple')}${whereOf(e) ? ` · ${whereOf(e)}` : ''}`} value={e.sign_up ? say('signedUp', { n: `${points(e.counts.signed_up, i18n.language)}${e.capacity === null ? '' : ` / ${points(e.capacity, i18n.language)}`}` }) : say('noSignup')} status={e.phase === 'draft' || e.phase === 'cancelled' || e.phase === 'ended' ? t(`loyalty.events.phase.${e.phase}`, PHASE_WORDS[e.phase]) : e.counts.room_left === 0 ? say('full') : e.sign_up ? say('signupOpen') : say('noSignup')} tone={e.counts.room_left === 0 || e.status !== 'published' ? 'amber' : 'green'} />)}</ul>
      <Pager page={data.page} pages={data.pages} onPage={n => change({ page: String(n), selected: '' }, true)} /><p className="l-ev-zone">{say('zone', { zone: boot.venue.timezone })}</p></section>
      <section className="l-ov-panel l-ev-promotion"><h2><EventEyebrow>{null}</EventEyebrow>{say('promotion')}</h2><p>{say('promotionLine')}</p><Link className="l-ov-link" to="/loyalty/program?tab=boosts">{say('boosts')}</Link></section></div>{selected && <EventDetails event={selected} canChange={data.can_change} />}</div>}
    {data && !data.can_change && <p className="l-ev-hint">{t('loyalty.events.read_only', 'Managers and staff allowed to manage offers create events.')}</p>}
  </div>
}
