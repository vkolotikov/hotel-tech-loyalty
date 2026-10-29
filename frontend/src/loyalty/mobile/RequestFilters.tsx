import { useState } from 'react'
import { OverviewButton, OverviewDialog } from '../overview/OverviewUI'
import { useRequestWords } from '../requests/words'
import type { InboxFilters, InboxView, RequestKind } from '../requests/types'
import { useMobileWords } from './words'

export function RequestFilters({ value, onApply, onClose }: { value: InboxFilters; onApply: (value: Pick<InboxFilters, 'type' | 'view' | 'sort'>) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(value)
  const say = useMobileWords()
  const words = useRequestWords()
  return <OverviewDialog kind="form" className="l-mw-sheet" title={say('filters')} onClose={onClose}><label><span>{words('type')}</span><select value={draft.type} onChange={e => setDraft({ ...draft, type: e.target.value as 'all' | RequestKind, view: ['waiting', 'approved'].includes(draft.view) ? 'open' : draft.view })}>{(['all', 'benefit', 'redemption', 'referral'] as const).map(k => <option key={k} value={k}>{words(k === 'all' ? 'allTypes' : k)}</option>)}</select></label><label><span>{words('view')}</span><select value={draft.view} onChange={e => setDraft({ ...draft, view: e.target.value as InboxView })}>{(['open', 'closed', 'all', ...(draft.type === 'benefit' ? ['waiting', 'approved'] as const : [])] as const).map(k => <option key={k} value={k}>{words(k)}</option>)}</select></label><label><span>{words('sort')}</span><select value={draft.sort} onChange={e => setDraft({ ...draft, sort: e.target.value as 'newest' | 'oldest' })}><option value="newest">{words('newest')}</option><option value="oldest">{words('oldest')}</option></select></label><div className="l-mw-sheet-actions"><OverviewButton onClick={() => setDraft({ ...draft, type: 'all', view: 'open', sort: 'newest' })}>{say('reset')}</OverviewButton><OverviewButton primary onClick={() => { onApply(draft); onClose() }}>{say('apply')}</OverviewButton></div></OverviewDialog>
}
