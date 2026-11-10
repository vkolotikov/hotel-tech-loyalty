import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ThemeName } from '../../workspace/theme/accent'
import { OverviewButton } from '../overview/OverviewUI'
import { points } from '../lib/format'
import { todayWords, whoMayEnter } from '../places/placesMath'
import type { Place, PlacesList } from '../places/placesApi'
import { detectEnv } from '../scan/scanMath'
import { useRedesignWords } from '../redesign/words'
import { useAdminWords } from './words'
import { ManagementColumns, ManagementFact, ManagementLabels, ManagementPanel, ManagementRow, ManagementSelection, ManagementStatus, ManagementVisual, ManagementOutcome, ManagementIcon } from './ManagementUI'
import { adminAssets } from './assets'

export function PlacesDirectory({ data, change, onOpen }: { data: PlacesList; change: boolean; theme: ThemeName; onOpen: (next: { kind: 'place'; place: Place | null } | { kind: 'entries'; place: Place }) => void }) {
  const { t, i18n } = useTranslation(), say = useRedesignWords(), admin = useAdminWords(), location = useLocation(), navigate = useNavigate()
  const [q, setQ] = useState(''), [level, setLevel] = useState('all'), [status, setStatus] = useState('all')
  const visible = data.places.filter(p => (p.name + ' ' + (p.description ?? '')).toLocaleLowerCase().includes(q.toLocaleLowerCase()) && (level === 'all' || p.admits === 'all' || p.tiers.some(t => String(t.id) === level)) && (status === 'all' || p.is_active === (status === 'active')))
  const selected = visible.find(p => String(p.id) === new URLSearchParams(location.search).get('selected')) ?? visible[0]
  const who = (p: Place) => whoMayEnter(p).kind === 'every' ? t('loyalty.places.every_member', 'Every member') : p.tiers.map(t => t.name).join(' · ')
  const badge = (p: Place) => <ManagementStatus state={p.is_active ? 'active' : 'off'}>{say(p.is_active ? 'active' : 'off')}</ManagementStatus>
  const env = detectEnv(), nfc = env.secure && env.webNfc
  const doorCheck = selected && <div className="l-ad-inset l-ad-door-check"><h3>{say('pgDoorCheck')}</h3><div className="l-ad-actions">
    {nfc && <Link className="l-ov-button" to={`/loyalty/scan?place=${selected.id}&method=nfc`}><ManagementIcon kind="tap" />{admin('nfcFirst')}</Link>}
    <Link className="l-ov-button" to={`/loyalty/scan?place=${selected.id}&method=camera`}><ManagementIcon kind="qr" />QR</Link>
    <Link className="l-ov-button" to={`/loyalty/scan?place=${selected.id}&method=lookup`}><ManagementIcon kind="search" />{admin('lookup')}</Link>
  </div></div>
  return <><div className="l-ad-summary"><ManagementFact icon="pin" label={admin('places')}><strong>{admin('activePlaces', { n: data.places.filter(p => p.is_active).length })}</strong></ManagementFact><ManagementFact icon="door" label={admin('entriesToday')}><strong>{points(data.places.reduce((n,p) => n + p.today.granted, 0), i18n.language)}</strong></ManagementFact>{selected && <Link className="l-ov-button" to={`/loyalty/scan?place=${selected.id}`}>{admin('testAccess')}</Link>}</div><ManagementColumns><ManagementPanel title={say('pgPlaceDirectory')} count={points(data.places.length, i18n.language)}>
    <div className="l-ad-filters"><label className="l-ad-search"><img src={adminAssets.search.src} width={14} height={14} alt="" /><input type="search" aria-label={say('pgSearchPlaces')} value={q} placeholder={say('pgSearchPlacesHint')} onChange={e => setQ(e.target.value)} /></label><label><select aria-label={say('pgEligibleLevel')} value={level} onChange={e => setLevel(e.target.value)}><option value="all">{say('allLevels')}</option>{data.tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label><select aria-label={say('status')} value={status} onChange={e => setStatus(e.target.value)}><option value="all">{say('allStates')}</option><option value="active">{say('active')}</option><option value="off">{say('off')}</option></select></label></div>
    <ManagementLabels first={say('pgPlaceDirectory')} value={say('pgEligibleLevel')} status={say('status')} />
    <ul className="l-ad-list">{visible.map(p => <ManagementRow key={p.id} record={`place-${p.id}`} icon="door" tone="violet" title={p.name} caption={`${points(p.today.granted, i18n.language)} · ${admin('entriesToday')}`} value={who(p)} status={badge(p)} selected={selected?.id === p.id} onSelect={() => navigate(`/loyalty/program?tab=places&selected=${p.id}`, { replace: true })} />)}</ul>
    {!visible.length && <OverviewButton onClick={() => { setQ(''); setLevel('all'); setStatus('all') }}>{say('pgClearFilters')}</OverviewButton>}
    {doorCheck}
  </ManagementPanel>{selected && <ManagementSelection title={selected.name} heading={admin('selectedPlace')} status={badge(selected)} onEdit={change ? () => onOpen({ kind: 'place', place: selected }) : undefined}>
    <ManagementVisual art="accessArt" label={admin('memberAccess')} title={selected.name} line={selected.description} tone="cyan" />
    <ManagementFact icon="peopleGold" label={t('loyalty.places.who', 'Who may enter')}>{who(selected)}</ManagementFact>
    <button className="l-ov-link" onClick={() => onOpen({ kind: 'entries', place: selected })}>{t(...todayWords(selected.today, i18n.language))} →</button>
    <ManagementOutcome label={admin('example')} from={`${admin('validMembership')} + ${admin('eligibleTier')}`} to={admin('allowEntry')} />
  </ManagementSelection>}</ManagementColumns></>
}
