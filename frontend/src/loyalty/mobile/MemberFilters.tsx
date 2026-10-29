import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { OverviewButton, OverviewDialog } from '../overview/OverviewUI'
import { LIST_STATES, NO_FILTERS, type ListFilters, type ListState } from '../members/membersQuery'
import type { MemberSort } from '../lib/types'
import { useRedesignWords } from '../redesign/words'
import { useMobileWords } from './words'

export function MemberFilters({ value, onApply, onClose }: { value: ListFilters; onApply: (value: ListFilters) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  const boot = useBoot()
  const say = useMobileWords()
  const words = useRedesignWords()
  const { t } = useTranslation()
  return <OverviewDialog kind="form" className="l-mw-sheet" title={say('filters')} onClose={onClose}>
    <label><span>{words('level')}</span><select value={draft.tier_id ?? ''} onChange={e => setDraft({ ...draft, tier_id: e.target.value ? Number(e.target.value) : null })}><option value="">{words('allLevels')}</option>{boot.programme.tiers.filter(tr => tr.is_active || tr.id === draft.tier_id).map(tr => <option key={tr.id} value={tr.id}>{tr.name}</option>)}</select></label>
    <label><span>{words('membership')}</span><select value={draft.state} onChange={e => setDraft({ ...draft, state: e.target.value as ListState })}>{LIST_STATES.map(state => <option key={state} value={state}>{state === 'all' ? words('allStates') : words(state === 'inactive' ? 'off' : state)}</option>)}</select></label>
    <label><span>{words('sort')}</span><select value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value as MemberSort })}>{(['recent', 'points', 'name', 'activity'] as const).map(key => <option key={key} value={key}>{t(`loyalty.members.sort_${key}`, { defaultValue: key })}</option>)}</select></label>
    <div className="l-mw-sheet-actions"><OverviewButton onClick={() => setDraft({ ...NO_FILTERS, q: value.q })}>{say('reset')}</OverviewButton><OverviewButton primary onClick={() => { onApply({ ...draft, page: 1 }); onClose() }}>{say('apply')}</OverviewButton></div>
  </OverviewDialog>
}
