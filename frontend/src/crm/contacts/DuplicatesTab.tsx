import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AtSign, Building2, GitMerge, Phone, UserRound, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { timeAgo } from '../lib/format'
import { useRecords } from '../lib/useRecords'
import { Avatar } from '../ui/Avatar'
import { Card } from '../ui/Card'
import { EmptyState } from '../ui/EmptyState'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { displayName, reasonKey } from './contactsLogic'
import { MergeConfirm } from './MergeConfirm'
import { useDuplicates } from './queries'
import type { DuplicateGuest, DuplicatePair } from './types'

const REASON_FALLBACK: Record<string, string> = {
  'duplicates.reason_email': 'Same email', 'duplicates.reason_phone': 'Same phone',
  'duplicates.reason_name': 'Same name and company or city', 'duplicates.reason_other': 'Look alike',
}
const REASON_ICON: Record<string, LucideIcon> = { shared_email: AtSign, shared_phone: Phone, shared_name_context: UserRound }

/**
 * Contacts that look like the same person (round 5, compact): one row a pair — why, the two side by side (each opening
 * in its panel), and Merge, which asks first (MergeConfirm says what a merge does and that it cannot be undone).
 */
export function DuplicatesTab() {
  const { t } = useTranslation()
  const pairs = useDuplicates()
  const [pending, setPending] = useState<DuplicatePair | null>(null)
  const list = pairs.data?.pairs ?? []

  return (
    <div className="space-y-3">
      <QueryState loading={pairs.isLoading} error={pairs.error} onRetry={() => { void pairs.refetch() }}>
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={GitMerge} title={t('crm.contacts.duplicates.none', 'No duplicates found')} />
          </Card>
        ) : (
          <Card padded={false} title={t('crm.contacts.duplicates.pairs', 'Look-alikes')} icon={GitMerge} tone="pending"
            description={t('crm.contacts.duplicates.none_line', 'Contacts with the same email, the same phone, or the same name at the same company or city show up here.')}
            hint={t('crm.common.total', '{{count}} in all', { count: list.length })}>
            <ul className="divide-y divide-a-border">
              {list.map(pair => {
                const Icon = REASON_ICON[pair.reason] ?? GitMerge
                return (
                  <li key={`${pair.winner.id}-${pair.loser.id}`} className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:gap-3">
                    <Pill tone="pending"><Icon size={12} aria-hidden />{t(`crm.contacts.${reasonKey(pair.reason)}`, REASON_FALLBACK[reasonKey(pair.reason)])}</Pill>
                    <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                      <Person guest={pair.winner} role={t('crm.contacts.duplicates.older', 'Older')} />
                      <Person guest={pair.loser} role={t('crm.contacts.duplicates.newer', 'Newer')} />
                    </div>
                    <Button size="sm" variant="secondary" className="self-start md:self-center" onClick={() => setPending(pair)}>
                      <GitMerge size={14} aria-hidden />{t('crm.contacts.duplicates.merge', 'Merge')}
                    </Button>
                  </li>
                )
              })}
            </ul>
          </Card>
        )}
      </QueryState>
      {pending && <MergeConfirm pair={pending} onClose={() => setPending(null)} />}
    </div>
  )
}

/** One side of a pair: enough to tell the two apart, opening in its panel. */
function Person({ guest, role }: { guest: DuplicateGuest; role: string }) {
  const { t, i18n } = useTranslation()
  const records = useRecords()
  const name = displayName(guest) ?? t('crm.common.no_name', 'No name')
  const reach = guest.email ?? guest.phone ?? guest.mobile
  return (
    <Link to={records.href('contact', guest.id)} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-a-border bg-a-surface-2/50 px-2.5 py-2 hover:border-a-accent/40 focus-visible:outline-2 focus-visible:outline-a-accent">
      <Avatar name={name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="truncate text-sm font-medium text-a-text">{name}</span>
          <span className="shrink-0 text-xs text-a-text-2">{role} · {timeAgo(guest.created_at, i18n.language)}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate text-xs text-a-text-2">
          {reach && <span className="truncate">{reach}</span>}
          {guest.company && <><Building2 size={11} aria-hidden className="ml-1 shrink-0" /><span className="truncate">{guest.company}</span></>}
          {!reach && !guest.company && <span>{[guest.city, guest.country].filter(Boolean).join(', ') || '—'}</span>}
        </span>
      </span>
    </Link>
  )
}
