import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useApi, useBoot } from '../../LoyaltyProvider'
import { overviewScope } from '../../overview/overviewMath'
import { OverviewButton } from '../../overview/OverviewUI'
import { DesignDialog } from '../../redesign/DesignUI'
import type { MemberRow } from '../../lib/types'
import type { ScanContext } from '../scanContext'
import { useScanWords } from './words'

export function ManualLookup({ context, onClose, onMember, codeField }: { context: ScanContext; onClose: () => void; onMember: (member: MemberRow) => void; codeField: React.ReactNode }) {
  const words = useScanWords(), api = useApi(), boot = useBoot()
  const [typed, setTyped] = useState(''), [asked, setAsked] = useState('')
  const [selected, setSelected] = useState<MemberRow | null>(null)
  const result = useQuery({ queryKey: ['loyalty', 'find', asked, overviewScope(boot)], queryFn: () => api.find(asked), enabled: asked.length >= 2, retry: false, staleTime: 0 })
  const settled = typed.trim() === asked && asked.length >= 2 && result.isSuccess && !result.isFetching
  return <DesignDialog title={words('lookup')} onClose={onClose}><div className="l-sc-lookup l-rd-form">
    <form className="l-sc-stack" onSubmit={e => { e.preventDefault(); setSelected(null); if (typed.trim() === asked) void result.refetch(); else setAsked(typed.trim()) }}><label>{words('searchLabel')}<input autoFocus value={typed} onChange={e => { setTyped(e.target.value); setSelected(null) }} autoComplete="off" /></label><OverviewButton type="submit" disabled={typed.trim().length < 2 || result.isFetching}>{result.isFetching ? words('loading') : words('search')}</OverviewButton></form>
    {typed.trim().length < 2 && <small>{words('searchMore')}</small>}
    {result.isError && <p role="alert">{words('unavailable')}</p>}
    {settled && <div><p>{words('matches')} · {result.data.members.length}</p>{result.data.members.length === 0 && <p>{words('noMatches')}</p>}<div className="l-sc-stack" role="group" aria-label={words('matches')}>{result.data.members.map(member => <button className="l-sc-match" key={member.id} aria-pressed={selected?.id === member.id} onClick={() => setSelected(member)}><strong>{member.name || member.member_number}</strong><small>{[member.member_number, member.email].filter(Boolean).join(' · ')}</small></button>)}</div></div>}
    <small>{words('identityHint')}</small>{context.kind !== 'desk' && <small>{words(context.kind === 'event' ? 'eventEffects' : 'noCheckin')}</small>}
    <OverviewButton primary disabled={!settled || !selected || (context.kind !== 'desk' && !selected.member_number)} onClick={() => { if (selected) onMember(selected) }}>{words(context.kind === 'desk' ? 'open' : context.kind === 'event' ? 'checkEvent' : 'checkAccess')}</OverviewButton>
    <details><summary>{words('lookupCode')}</summary>{codeField}</details>
  </div></DesignDialog>
}
