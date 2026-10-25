import { useEffect, useId, useState, type ReactNode, type Ref } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useApi, useBoot } from '../LoyaltyProvider'
import { useLook } from '../lib/look'
import type { MemberRow } from '../lib/types'
import { TierChip } from '../ui/TierChip'

/**
 * Find a member by name, email, phone or number (the workspace's own `find`, from two letters, once typing pauses) and
 * act on one: the event page's "Check in by name" and "Add a member". Each result carries the action as a real button
 * (`action(member)` draws it), so the keyboard reaches it with Tab.
 */
export function MemberPicker({ label, action, inputRef }: {
  label: string
  action: (member: MemberRow) => ReactNode
  inputRef?: Ref<HTMLInputElement>
}) {
  const { t } = useTranslation()
  const api = useApi()
  const boot = useBoot()
  const look = useLook()
  const id = useId()
  const [query, setQuery] = useState('')
  const [asked, setAsked] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => setAsked(query.trim()), 250)
    return () => window.clearTimeout(timer)
  }, [query])

  const search = useQuery({
    queryKey: ['loyalty', 'find', asked],
    queryFn: () => api.find(asked),
    enabled: asked.length >= 2,
    staleTime: 15_000,
  })
  const members = asked.length >= 2 ? (search.data?.members ?? []) : []
  const tierOf = (m: MemberRow) => boot.programme.tiers.find(tier => tier.id === m.tier_id) ?? null

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-xs font-medium text-a-text-2">{label}</label>
      <div className="relative">
        <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-a-text-2" />
        <input id={id} ref={inputRef} type="search" value={query} autoComplete="off" spellCheck={false} onChange={(e) => setQuery(e.target.value)}
          placeholder={t('loyalty.events.picker.placeholder', 'Name, email, phone or member number')}
          className="w-full rounded-lg border border-a-border bg-a-surface py-2 pl-9 pr-3 text-sm text-a-text" />
      </div>
      <div aria-live="polite" className="text-xs text-a-text-2">
        {query.trim().length > 0 && query.trim().length < 2 && t('loyalty.events.picker.two_letters', 'Type at least two letters.')}
        {asked.length >= 2 && search.isFetching && !search.data && t('loyalty.events.picker.searching', 'Searching…')}
        {asked.length >= 2 && search.data && members.length === 0 && t('loyalty.events.picker.none', 'No member matches.')}
      </div>
      {members.length > 0 && (
        <ul className="divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
          {members.slice(0, 8).map(member => (
            <li key={member.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-a-text">{member.name}</p>
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-a-text-2">
                  {member.member_number && <span className="font-a-mono">{member.member_number}</span>}
                  <TierChip tier={tierOf(member)} theme={look.resolved} size="sm" />
                </p>
              </div>
              {action(member)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
