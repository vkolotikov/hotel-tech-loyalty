import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useApi } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { ERRORS, errorKey, refusalKey } from '../lib/errors'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { settledMembers } from '../find/findItems'
import { afterCardChange, cardsApi } from './cardsApi'

const INPUT = 'w-full rounded-xl border border-a-border bg-a-surface px-4 py-3 text-base text-a-text'

/**
 * "Link this card" from Scan (release 5, spec 2026-10-23 §3): a card nobody has, or one switched off here, linked to
 * a member found by name, email, phone or number (the workspace's Find, from two letters). The server normalises the
 * ID and refuses a card another member or another organisation has; the dialog says so in its own words.
 */
export function LinkCardDialog({ uid, onClose, onLinked }: { uid: string; onClose: () => void; onLinked: (member: MemberRow) => void }) {
  const { t } = useTranslation()
  const api = useApi()
  const client = useQueryClient()
  const field = useFirstFocus<HTMLInputElement>()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')

  // The server is asked once typing pauses; the state is set from the timer's callback.
  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(query.trim()), 200)
    return () => window.clearTimeout(timer)
  }, [query])

  const typed = query.trim()
  const search = useQuery({
    queryKey: ['loyalty', 'find', asked],
    queryFn: () => api.find(asked).then(r => r.members),
    enabled: asked.length >= 2,
    staleTime: 30_000,
    retry: false,
  })
  const members = settledMembers(typed, asked, search.data)
  const waiting = typed.length >= 2 && (asked !== typed || search.isFetching)

  const link = useMutation({
    mutationFn: (member: MemberRow) => cardsApi.link(member.id, uid),
    onSuccess: (_answer, member) => { afterCardChange(client, member.id); onLinked(member) },
  })
  const failure = link.isError ? failureOf(link.error) : null

  return (
    <Dialog title={t('loyalty.scan.link_title', 'Link this card to a member')} onClose={onClose} busy={link.isPending}>
      <div className="space-y-4">
        <p className="text-sm text-a-text-2">{t('loyalty.scan.link_card_id', 'Card {{id}}', { id: uid })}</p>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-a-text">{t('loyalty.scan.link_find', 'Find the member by name, email, phone or number')}</span>
          <input ref={field} value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" spellCheck={false} className={INPUT} />
        </label>
        {typed.length < 2 && <p className="text-sm text-a-text-2">{t('loyalty.scan.link_type_more', 'Type two letters or more.')}</p>}
        {waiting && <p role="status" className="text-sm text-a-text-2">{t('loyalty.scan.link_searching', 'Searching members…')}</p>}
        {!waiting && typed.length >= 2 && search.isError && <Notice tone="danger">{t(...errorKey('load', failureOf(search.error)))}</Notice>}
        {!waiting && typed.length >= 2 && search.isSuccess && members.length === 0 && <p className="text-sm text-a-text-2">{t('loyalty.scan.link_none', 'No member matches.')}</p>}
        {members.length > 0 && (
          <ul className="divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
            {members.map(m => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-a-text">{m.name || m.email || m.member_number}</span>
                  <span className="block truncate font-a-mono text-xs text-a-text-2">{[m.member_number, m.email].filter(Boolean).join(' · ')}</span>
                </span>
                <Button size="sm" loading={link.isPending && link.variables?.id === m.id} disabled={link.isPending} onClick={() => link.mutate(m)}>
                  <Link2 size={14} aria-hidden />{t('loyalty.scan.link_do', 'Link')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty', ERRORS, 'cards', failure))}</Notice>}
        <div className="flex justify-end pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={link.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
        </div>
      </div>
    </Dialog>
  )
}
