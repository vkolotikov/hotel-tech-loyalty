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
import { ManagementColumns, ManagementFact, ManagementPanel, ManagementRow, ManagementSelection, ManagementStatus, ManagementVisual, ManagementOutcome, ManagementIcon } from './ManagementUI'

export function PlacesDirectory({ data, change, onOpen }: { data: PlacesList; change: boolean; theme: ThemeName; onOpen: (next: { kind: 'place'; place: Place | null } | { kind: 'entries'; place: Place }) => void }) {
  const { t, i18n } = useTranslation(), say = useRedesignWords(), admin = useAdminWords(), location = useLocation(), navigate = useNavigate()
  const [q, setQ] = useState(''), [level, setLevel] = useState('all'), [status, setStatus] = useState('all')
  const visible = data.places.filter(p => (p.name + ' ' + (p.description ?? '')).toLocaleLowerCase().includes(q.toLocaleLowerCase()) && (level === 'all' || p.admits === 'all' || p.tiers.some(t => String(t.id) === level)) && (status === 'all' || p.is_active === (status === 'active')))
  const selected = visible.find(p => String(p.id) === new URLSearchParams(location.search).get('selected')) ?? visible[0]
  const who = (p: Place) => whoMayEnter(p).kind === 'every' ? t('loyalty.places.every_member', 'Every member') : p.tiers.map(t => t.name).join(' · ')
  const badge = (p: Place) => <ManagementStatus state={p.is_active ? 'active' : 'off'}>{say(p.is_active ? 'active' : 'off')}</ManagementStatus>
  const env = detectEnv(), nfc = env.secure && env.webNfc
  return <><ManagementColumns><ManagementPanel title={say('pgPlaceDirectory')} count={`${data.places.filter(p => p.is_active).length} / ${data.places.length}`}>
    <div className="l-ad-filters"><label><span>{say('pgSearchPlaces')}</span><input type="search" value={q} placeholder={say('pgSearchPlacesHint')} onChange={e => setQ(e.target.value)} /></label><label><span>{say('status')}</span><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">{say('allStates')}</option><option value="active">{say('active')}</option><option value="off">{say('off')}</option></select></label></div>
    <label className="l-rb-field"><span>{say('pgEligibleLevel')}</span><select value={level} onChange={e => setLevel(e.target.value)}><option value="all">{say('allLevels')}</option>{data.tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <ul className="l-ad-list">{visible.map(p => <ManagementRow key={p.id} record={`place-${p.id}`} icon="door" title={p.name} caption={who(p)} value={`${points(p.today.granted, i18n.language)} · ${admin('entriesToday')}`} status={badge(p)} selected={selected?.id === p.id} onSelect={() => navigate(`/loyalty/program?tab=places&selected=${p.id}`, { replace: true })} />)}</ul>
    {!visible.length && <OverviewButton onClick={() => { setQ(''); setLevel('all'); setStatus('all') }}>{say('pgClearFilters')}</OverviewButton>}
  </ManagementPanel>{selected && <ManagementSelection title={selected.name} status={badge(selected)} onEdit={change ? () => onOpen({ kind: 'place', place: selected }) : undefined}>
    <ManagementVisual art="accessArt" label={admin('who')} title={who(selected)} line={selected.description} tone="gold" />
    <ManagementFact icon="peopleGold" label={t('loyalty.places.who', 'Who may enter')}>{who(selected)}</ManagementFact>
    <button className="l-ov-link" onClick={() => onOpen({ kind: 'entries', place: selected })}>{t(...todayWords(selected.today, i18n.language))} →</button>
    <div className="l-ad-inset"><h3>{say('pgDoorCheck')}</h3>{nfc && <p className="l-ad-muted">{admin('nfcFirst')}</p>}<div className="l-ad-actions">
      {nfc && <Link className="l-ov-button l-ov-primary" to={`/loyalty/scan?place=${selected.id}&method=nfc`}><ManagementIcon kind="tap" />NFC</Link>}
      <Link className={`l-ov-button${nfc ? '' : ' l-ov-primary'}`} to={`/loyalty/scan?place=${selected.id}&method=camera`}><ManagementIcon kind="qr" />QR</Link>
      <Link className="l-ov-button" to={`/loyalty/scan?place=${selected.id}&method=lookup`}><ManagementIcon kind="search" />{admin('lookup')}</Link>
    </div></div>
    <ManagementOutcome label={admin('example')} from={`${admin('validMembership')} + ${admin('eligibleTier')}`} to={admin('allowEntry')} />
  </ManagementSelection>}</ManagementColumns></>
}
