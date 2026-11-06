import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ThemeName } from '../../workspace/theme/accent'
import { OverviewButton } from '../overview/OverviewUI'
import { overviewAssets } from '../overview/assets'
import { FormField } from '../ui/formParts'
import { MemberTierChip } from '../members/presentation'
import { useRedesignWords } from '../redesign/words'
import { programAssets } from '../program/design/assets'
import { points } from '../lib/format'
import { todayWords, whoMayEnter } from './placesMath'
import type { Place, PlacesList } from './placesApi'
import '../members/members-design.css'

/** Presentation over the existing places answer; entrance/rule management remains in its existing dialogs. */
export function PlacesDirectory({ data, change, onOpen }: { data: PlacesList; change: boolean; theme: ThemeName; onOpen: (next: { kind: 'place'; place: Place | null } | { kind: 'entries'; place: Place }) => void }) {
  const { t, i18n } = useTranslation(), say = useRedesignWords()
  const [q, setQ] = useState(''), [level, setLevel] = useState('all'), [status, setStatus] = useState('all')
  const visible = data.places.filter(p => (p.name + ' ' + (p.description ?? '')).toLocaleLowerCase(i18n.language).includes(q.toLocaleLowerCase(i18n.language)) && (level === 'all' || p.admits === 'all' || p.tiers.some(t => String(t.id) === level)) && (status === 'all' || p.is_active === (status === 'active')))
  const clear = () => { setQ(''); setLevel('all'); setStatus('all') }
  const openEntries = (place: Place) => onOpen({ kind: 'entries', place })
  return <>
    <div className="l-pg-place-figures">{[
      { value: data.places.length, label: t('loyalty.places.title', 'Places'), icon: programAssets.pin },
      { value: data.places.filter(p => p.is_active).length, label: say('pgActivePlaces'), icon: programAssets.door },
      { value: data.places.reduce((n, p) => n + p.today.granted, 0), label: say('pgGrantedToday'), icon: programAssets.shield },
    ].map(row => <div key={row.label}><strong>{points(row.value, i18n.language)}</strong><span>{row.label}</span><span className="l-pg-icon"><img src={row.icon} alt="" /></span></div>)}</div>
    <section className="l-ov-panel l-pg-place-directory" aria-labelledby="place-directory-title"><h2 id="place-directory-title"><span className="l-pg-icon"><img src={programAssets.pin} alt="" /></span>{say('pgPlaceDirectory')}</h2><div className="l-pg-place-filters">
      <FormField label={say('pgSearchPlaces')}><input type="search" value={q} maxLength={100} placeholder={say('pgSearchPlacesHint')} onChange={e => setQ(e.target.value)} /></FormField>
      <FormField label={say('pgEligibleLevel')}><select value={level} onChange={e => setLevel(e.target.value)}><option value="all">{say('allLevels')}</option>{data.tiers.map(tier => <option key={tier.id} value={tier.id}>{tier.name}</option>)}</select></FormField>
      <FormField label={say('status')}><select value={status} onChange={e => setStatus(e.target.value)}><option value="all">{say('allStates')}</option><option value="active">{say('active')}</option><option value="off">{say('off')}</option></select></FormField>
    </div></section>
    <ul className="l-pg-place-grid" aria-label={t('loyalty.places.list', 'Places')}>{visible.map(place => {
      const who = whoMayEnter(place)
      return <li key={place.id} data-place={place.id} className="l-pg-place-card"><header><span className="l-pg-icon"><img src={programAssets.pin} alt="" /></span><span className="l-pg-pill" data-tone={place.is_active ? 'green' : 'neutral'}><img src={place.is_active ? programAssets.activeDot : overviewAssets.neutral} alt="" />{say(place.is_active ? 'active' : 'off')}</span></header>
        <h3>{place.name}</h3>{place.description && <p>{place.description}</p>}
        <div className="l-pg-place-admits"><small>{t('loyalty.places.who', 'Who may enter')}</small>{who.kind === 'every' ? <span>{t('loyalty.places.every_member', 'Every member')}</span> : <ul aria-label={t('loyalty.places.tiers_let_in', 'Tiers let in')}>{who.tiers.map(tier => <li key={tier.id}><MemberTierChip tier={tier} /></li>)}</ul>}</div>
        <button type="button" className="l-pg-place-today" onClick={() => openEntries(place)} aria-label={t('loyalty.places.see_entries', 'see the entries at {{place}}', { place: place.name })}>{t(...todayWords(place.today, i18n.language))} →</button>
        <OverviewButton aria-label={change ? `${t('loyalty.places.edit', 'Edit')} ${place.name}` : `${say('pgViewEntries')} ${place.name}`} onClick={() => change ? onOpen({ kind: 'place', place }) : openEntries(place)}>{say(change ? 'pgManagePlace' : 'pgViewEntries')}</OverviewButton>
      </li>
    })}</ul>
    {!visible.length && <div className="l-ov-panel l-pg-empty"><p>{say('pgNoResults')}</p><OverviewButton onClick={clear}>{say('pgClearFilters')}</OverviewButton></div>}
    <section className="l-pg-door-check"><span className="l-pg-icon"><img src={programAssets.tap} alt="" /></span><div><h2>{say('pgDoorCheck')}</h2><p>{say('pgDoorLine')}</p></div><Link className="l-ov-button" to="/loyalty/scan">{say('pgOpenDoor')}</Link></section>
  </>
}
