import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, GitMerge, Mail, MapPin, Phone, Building2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, send } from '../lib/api'
import { errorText } from '../lib/errors'
import { timeAgo } from '../lib/format'
import { contactPath } from '../lib/links'
import { Card } from '../ui/Card'
import { Confirm } from '../ui/Confirm'
import { EmptyState } from '../ui/EmptyState'
import { TextArea } from '../ui/inputs'
import { Pill } from '../ui/Pill'
import { QueryState } from '../ui/QueryState'
import { useToast } from '../ui/Toast'
import { displayName, mergeBody, mergeSides, reasonKey } from './contactsLogic'
import { refreshAfterContactChange, useDuplicates } from './queries'
import type { DuplicateGuest, DuplicatePair } from './types'

const REASON_FALLBACK: Record<string, string> = {
  'duplicates.reason_email': 'Same email', 'duplicates.reason_phone': 'Same phone',
  'duplicates.reason_name': 'Same name and company or city', 'duplicates.reason_other': 'Look alike',
}

/** Contacts that look like the same person, and merging two into one (POST guests/merge). */
export function DuplicatesTab() {
  const { t } = useTranslation()
  const pairs = useDuplicates()
  const [pending, setPending] = useState<DuplicatePair | null>(null)
  const list = pairs.data?.pairs ?? []

  return (
    <div className="space-y-4">
      <Notice tone="warning">
        {t('crm.contacts.duplicates.warning', 'Merging cannot be undone. The contact you keep takes over the other’s leads, timeline, tags and tasks; its own details stay, and the other’s only fill its blanks.')}
      </Notice>
      <QueryState loading={pairs.isLoading} error={pairs.error} onRetry={() => { void pairs.refetch() }}>
        {list.length === 0 ? (
          <Card>
            <EmptyState icon={GitMerge} title={t('crm.contacts.duplicates.none', 'No duplicates found')}
              line={t('crm.contacts.duplicates.none_line', 'Contacts with the same email, the same phone, or the same name at the same company or city show up here.')} />
          </Card>
        ) : (
          <ul className="space-y-3">
            {list.map(pair => (
              <li key={`${pair.winner.id}-${pair.loser.id}`}>
                <Card padded>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <Pill tone="pending">{t(`crm.contacts.${reasonKey(pair.reason)}`, REASON_FALLBACK[reasonKey(pair.reason)])}</Pill>
                    <span className="min-w-0 flex-1 truncate text-sm text-a-text-2">
                      {pair.reason === 'shared_email' ? (pair.winner.email ?? pair.loser.email)
                        : pair.reason === 'shared_phone' ? (pair.winner.phone ?? pair.loser.phone)
                        : [pair.winner.full_name, pair.winner.company ?? pair.winner.city].filter(Boolean).join(' · ')}
                    </span>
                    <Button size="sm" onClick={() => setPending(pair)}><GitMerge size={14} aria-hidden />{t('crm.contacts.duplicates.review', 'Review and merge')}</Button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <PersonCard guest={pair.winner} role={t('crm.contacts.duplicates.suggested_keep', 'Older, kept by default')} />
                    <PersonCard guest={pair.loser} role={t('crm.contacts.duplicates.suggested_merge', 'Newer, merged into it')} />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      {pending && <MergeConfirm pair={pending} onClose={() => setPending(null)} />}
    </div>
  )
}

/** One side of a pair: enough to tell the two apart. */
function PersonCard({ guest, role }: { guest: DuplicateGuest; role: string }) {
  const { t, i18n } = useTranslation()
  const name = displayName(guest) ?? t('crm.common.no_name', 'No name')
  return (
    <div className="min-w-0 rounded-xl border border-a-border bg-a-surface-2 p-3 text-sm">
      <p className="text-xs font-medium text-a-text-2">{role}</p>
      <Link to={contactPath(guest.id)} className="mt-1 block truncate font-semibold text-a-text hover:underline">{name}</Link>
      {guest.lifecycle_status && <p className="truncate text-xs text-a-text-2">{guest.lifecycle_status}</p>}
      <ul className="mt-2 space-y-1 text-a-text-2">
        {guest.email && <li className="flex min-w-0 items-center gap-1.5"><Mail size={13} aria-hidden className="shrink-0" /><span className="truncate">{guest.email}</span></li>}
        {(guest.phone ?? guest.mobile) && <li className="flex min-w-0 items-center gap-1.5"><Phone size={13} aria-hidden className="shrink-0" /><span className="truncate">{guest.phone ?? guest.mobile}</span></li>}
        {guest.company && <li className="flex min-w-0 items-center gap-1.5"><Building2 size={13} aria-hidden className="shrink-0" /><span className="truncate">{guest.company}</span></li>}
        {(guest.city ?? guest.country) && <li className="flex min-w-0 items-center gap-1.5"><MapPin size={13} aria-hidden className="shrink-0" /><span className="truncate">{[guest.city, guest.country].filter(Boolean).join(', ')}</span></li>}
      </ul>
      <p className="mt-2 text-xs text-a-text-2">{t('crm.contacts.duplicates.added', 'Added {{when}}', { when: timeAgo(guest.created_at, i18n.language) })}</p>
    </div>
  )
}

/** Which one stays (swap to change it), an optional reason for the record, then merge for good. */
function MergeConfirm({ pair, onClose }: { pair: DuplicatePair; onClose: () => void }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const toast = useToast()
  const [swapped, setSwapped] = useState(false)
  const [reason, setReason] = useState('')
  const { keep, remove } = mergeSides(pair, swapped)
  const keepName = displayName(keep) ?? t('crm.common.no_name', 'No name')
  const removeName = displayName(remove) ?? t('crm.common.no_name', 'No name')
  const merge = useMutation({
    mutationFn: () => send('post', 'guests/merge', mergeBody(pair, swapped, reason)),
    onSuccess: () => {
      refreshAfterContactChange(qc, { leadsToo: true })
      toast(t('crm.contacts.duplicates.merged', 'Contacts merged'))
      onClose()
    },
  })
  // A merge the server refuses for a reason of its own (422) is said plainly; anything else in the usual words.
  const refused = merge.isError && failureOf(merge.error).status === 422 && !failureOf(merge.error).fields

  return (
    <Confirm title={t('crm.contacts.duplicates.confirm_title', 'Merge these two contacts?')} confirm={t('crm.contacts.duplicates.confirm', 'Merge for good')}
      busy={merge.isPending} onConfirm={() => merge.mutate()} onClose={onClose}>
      <div className="space-y-3">
        <p>{t('crm.contacts.duplicates.confirm_line', '{{remove}} is merged into {{keep}} and then removed. This cannot be undone.', { remove: removeName, keep: keepName })}</p>
        <dl className="grid grid-cols-2 gap-2 text-a-text">
          <div className="rounded-xl border border-a-border p-2.5"><dt className="text-xs text-a-text-2">{t('crm.contacts.duplicates.keep', 'Kept')}</dt><dd className="truncate font-medium">{keepName}</dd></div>
          <div className="rounded-xl border border-a-border p-2.5"><dt className="text-xs text-a-text-2">{t('crm.contacts.duplicates.goes', 'Merged and removed')}</dt><dd className="truncate font-medium">{removeName}</dd></div>
        </dl>
        <Button variant="ghost" size="sm" onClick={() => setSwapped(s => !s)} aria-pressed={swapped}>
          <ArrowLeftRight size={14} aria-hidden />{t('crm.contacts.duplicates.swap', 'Keep the other one instead')}
        </Button>
        <Field label={t('crm.contacts.duplicates.reason', 'Why (optional, kept in the record)')}>
          <TextArea rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
        </Field>
        {merge.isError && (
          <Notice tone="danger">{refused ? t('crm.contacts.duplicates.refused', 'These two cannot be merged: each is linked to a different member of the loyalty programme.') : errorText(t, merge.error)}</Notice>
        )}
      </div>
    </Confirm>
  )
}
