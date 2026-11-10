import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { MapPin, ShieldCheck, UserPlus } from 'lucide-react'
import { useBoot } from '../LoyaltyProvider'
import { OverviewButton, OverviewRecovery } from '../overview/OverviewUI'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Check, FormField, FormFoot } from '../ui/formParts'
import { failureOf } from '../lib/api'
import { PARTNERS_KEY, partnerApi, type Partner, type Place } from './api'
import { usePartnerWords } from './words'
import './partners.css'
const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

export function PartnersPage() {
  const w = usePartnerWords(), boot = useBoot(), client = useQueryClient()
  const query = useQuery({ queryKey: PARTNERS_KEY, queryFn: partnerApi.list, enabled: boot.staff.can.manage_members })
  const [editing, setEditing] = useState<Partner | 'new' | null>(null), [message, setMessage] = useState('')
  const action = useMutation({ mutationFn: async (work: { row: Partner; resend?: boolean }) => {
    if (work.resend) return partnerApi.resend(work.row.id)
    await partnerApi.state(work.row.id, !work.row.is_active); return null
  }, onSuccess: result => { setMessage(result ? w(result.email_sent ? 'sent' : 'mailFailed') : w('saved')); void client.invalidateQueries({ queryKey: PARTNERS_KEY }) } })
  if (!boot.staff.can.manage_members) return <Notice tone="danger">{w('rights')}</Notice>
  return <div className="l-ov-page">
    <header className="l-ov-page-heading"><div><h1>{w('title')}</h1><p>{w('line')}</p></div><OverviewButton primary disabled={!query.data?.places.length} onClick={() => { setMessage(''); setEditing('new') }}><UserPlus size={18} aria-hidden />{w('invite')}</OverviewButton></header>
    <section className="l-ov-panel l-partner-note"><ShieldCheck size={24} aria-hidden /><p>{w('rights')}</p></section>
    <section className="l-ov-panel l-partner-note"><div><h2>{w('app')}</h2><p>{w('appHint')}</p><a className="l-ov-link" href="/loyalty/partner" target="_blank" rel="noreferrer">/loyalty/partner ↗</a></div></section>
    {query.isError && <OverviewRecovery forbidden={failureOf(query.error).status === 403} onRetry={() => { void query.refetch() }} busy={query.isFetching} />}
    {query.isLoading && <p role="status">{w('scanning')}</p>}
    {query.data && !query.data.places.length && <Notice tone="info">{w('noPlaces')} <Link to="/loyalty/program?tab=places" className="l-ov-link">{w('places')} →</Link></Notice>}
    {message && <p role="status">{message}</p>}
    {action.isError && <Notice tone="danger">{w('failed')}</Notice>}
    {query.data?.partners.length === 0 && <section className="l-ov-panel l-partner-note">{w('empty')}</section>}
    <div className="l-partner-grid">{query.data?.partners.map(row => <section className="l-ov-panel l-partner-person" key={row.id}>
      <div><h2>{row.name}</h2><p>{row.email}</p><small>{!row.is_active ? w('off') : row.accepted ? w('active') : w('pending')}</small></div>
      <p className="l-partner-place-line"><MapPin size={16} aria-hidden />{query.data.places.filter(place => row.place_ids.includes(place.id)).map(place => place.name).join(', ') || w('noAccess')}</p>
      <div className="l-partner-actions"><OverviewButton disabled={action.isPending} onClick={() => setEditing(row)}>{w('edit')}</OverviewButton><OverviewButton disabled={action.isPending} onClick={() => { setMessage(''); action.mutate({ row }) }}>{w(row.is_active ? 'deactivate' : 'reactivate')}</OverviewButton>{!row.accepted && <OverviewButton disabled={action.isPending} onClick={() => { setMessage(''); action.mutate({ row, resend: true }) }}>{w('resend')}</OverviewButton>}</div>
    </section>)}</div>
    {editing && query.data && <PartnerDialog row={editing} places={query.data.places} onClose={() => setEditing(null)} onSaved={sent => { setEditing(null); setMessage(w(sent === undefined ? 'saved' : sent ? 'sent' : 'mailFailed')); void client.invalidateQueries({ queryKey: PARTNERS_KEY }) }} />}
  </div>
}

function PartnerDialog({ row, places, onClose, onSaved }: { row: Partner | 'new'; places: Place[]; onClose: () => void; onSaved: (sent?: boolean) => void }) {
  const w = usePartnerWords(), fresh = row === 'new'
  const [name, setName] = useState(''), [email, setEmail] = useState(''), [ids, setIds] = useState<number[]>(fresh ? [] : row.place_ids), [tried, setTried] = useState(false)
  const save = useMutation({ mutationFn: async () => {
    if (fresh) return (await partnerApi.invite({ name: name.trim(), email: email.trim(), loyalty_place_ids: ids })).email_sent
    await partnerApi.update(row.id, ids); return undefined
  }, onSuccess: onSaved })
  return <Dialog title={w(fresh ? 'invite' : 'edit')} busy={save.isPending} onClose={onClose}><form className="space-y-5" onSubmit={e => { e.preventDefault(); setTried(true); if (ids.length) save.mutate() }}>
    <fieldset disabled={save.isPending} className="space-y-5 min-w-0">
      {fresh ? <><FormField label={w('name')}><input className={INPUT} required maxLength={200} value={name} onChange={e => setName(e.target.value)} autoComplete="name" /></FormField><FormField label={w('email')}><input className={INPUT} type="email" required maxLength={200} value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" /></FormField></> : <p>{row.name}</p>}
      <fieldset className="space-y-3"><legend className="mb-3 font-semibold">{w('places')}</legend>{places.map(place => <Check key={place.id} label={place.name} checked={ids.includes(place.id)} onChange={on => setIds(on ? [...ids, place.id] : ids.filter(id => id !== place.id))} />)}</fieldset>
      {tried && !ids.length && <Notice tone="danger">{w('choose')}</Notice>}
      <p className="text-sm text-a-text-2">{w('rights')}</p>
    </fieldset>
    {save.isError && <Notice tone="danger">{w(failureOf(save.error).status === 402 ? 'plan' : 'failed')}</Notice>}
    <FormFoot cancel={w('cancelled')} save={w(fresh ? 'send' : 'save')} busy={save.isPending} onCancel={onClose} />
  </form></Dialog>
}
