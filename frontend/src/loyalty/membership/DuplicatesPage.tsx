import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { day, points } from '../lib/format'
import { memberPath } from '../lib/links'
import type { MemberRow } from '../lib/types'
import { duplicatesKey, membershipApi } from './api'
import { ERRORS } from './errors'
import { keptOf, listActions, mergeSides, pairKey } from './membershipMath'
import { MergeDialog } from './MergeDialog'
import type { DuplicatePair } from './types'
import { REASON_WORDS } from './words'

/**
 * Duplicates (`/loyalty/members/duplicates`, spec 2026-10-21 release 2 §4.1), a manager's: the members who look like
 * one person, two by two, with why they match (the same email, the same phone) and which one is kept — the oldest,
 * which the manager may change. Merge opens a dialog that lists what moves; the kept member's page opens after it.
 * Staff who open the address are told it is a manager's (the server refuses anyway).
 */
export function DuplicatesPage() {
  const { t } = useTranslation()
  const boot = useBoot()
  const manager = listActions(boot.staff.can).tools

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <Link to="/loyalty" className="inline-flex items-center gap-1 text-sm text-a-text-2 hover:text-a-text">
        <ArrowLeft size={15} aria-hidden />{t('loyalty.member.back', 'All members')}
      </Link>
      <PageHeader title={t('loyalty.membership.duplicates.title', 'Duplicates')}
        line={t('loyalty.membership.duplicates.line', 'Members who look like one person. Merging keeps one and moves everything of the other to it.')} />
      {manager
        ? <Pairs />
        : <div className="max-w-xl"><Notice tone="info">{t('loyalty.membership.duplicates.managers_only', 'Finding and merging duplicates is for an owner or a manager.')}</Notice></div>}
    </div>
  )
}

function Pairs() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const query = useQuery({ queryKey: duplicatesKey, queryFn: () => membershipApi.duplicates() })
  const [chosen, setChosen] = useState<Record<string, number>>({})
  const [merging, setMerging] = useState<{ pair: DuplicatePair; keep: number } | null>(null)

  if (query.isError) {
    return (
      <div className="max-w-xl space-y-3">
        <Notice tone="danger">{t(...refusalKey('loyalty.membership', ERRORS, 'load', failureOf(query.error)))}</Notice>
        <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (!query.data) {
    return (
      <div role="status" className="space-y-3">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-40" /><Skeleton className="h-40" />
      </div>
    )
  }
  if (query.data.pairs.length === 0) {
    return <p className="rounded-xl border border-dashed border-a-border px-4 py-8 text-center text-sm text-a-text-2">{t('loyalty.membership.duplicates.none', 'No likely duplicates. Members are matched by the same email or the same phone number.')}</p>
  }

  return (
    <>
      <p className="sr-only" role="status">{t('loyalty.membership.duplicates.count', 'Pairs: {{count}}', { count: query.data.pairs.length })}</p>
      <ul className="space-y-4">
        {query.data.pairs.map(pair => {
          const key = pairKey(pair)
          const keep = keptOf(pair, chosen)
          return (
            <li key={key} data-pair={key} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                {pair.reasons.map(reason => (
                  <span key={reason} data-reason={reason} className="rounded-full bg-a-surface-2 px-2.5 py-0.5 text-xs font-semibold text-a-text">
                    {t(`loyalty.membership.duplicates.reason.${reason}`, REASON_WORDS[reason] ?? reason)}
                  </span>
                ))}
              </div>
              <fieldset className="grid gap-3 md:grid-cols-2">
                <legend className="sr-only">{t('loyalty.membership.duplicates.keep_legend', 'The member to keep')}</legend>
                {[pair.a, pair.b].map(m => (
                  <Side key={m.id} member={m} pairKey={key} kept={keep === m.id} locale={locale} onKeep={() => setChosen(c => ({ ...c, [key]: m.id }))} />
                ))}
              </fieldset>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <p className="text-sm text-a-text-2">
                  {t('loyalty.membership.duplicates.will_keep', 'Keeps {{keep}}; {{merge}} is merged into it.', {
                    keep: mergeSides(pair, keep).keep.name, merge: mergeSides(pair, keep).merge.name,
                  })}
                </p>
                <Button onClick={() => setMerging({ pair, keep })}>{t('loyalty.membership.duplicates.merge', 'Merge…')}</Button>
              </div>
            </li>
          )
        })}
      </ul>
      {merging && <MergeDialog pair={merging.pair} keepId={merging.keep} onClose={() => setMerging(null)} />}
    </>
  )
}

/** One of the pair: who they are, and the choice to keep them. */
function Side({ member, pairKey: key, kept, locale, onKeep }: { member: MemberRow; pairKey: string; kept: boolean; locale: string; onKeep: () => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  return (
    <label data-side={member.id} className={`flex min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 ${kept ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border'}`}>
      <input type="radio" name={`keep-${key}`} checked={kept} onChange={onKeep} className="mt-1 h-4 w-4 shrink-0 accent-a-accent-text" />
      <span className="min-w-0 space-y-0.5 text-sm">
        <span className="block font-medium text-a-text">
          <Link to={memberPath(member.id)} className="hover:underline">{member.name || member.email || `#${member.id}`}</Link>
          {kept && <span className="ml-2 text-xs font-semibold text-a-accent-text">{t('loyalty.membership.duplicates.kept', 'Kept')}</span>}
        </span>
        <span className="block break-words text-a-text-2">{[member.email, member.phone].filter(Boolean).join(' · ')}</span>
        <span className="block text-a-text-2">
          {[
            member.member_number,
            t('loyalty.common.points_count', '{{points}} pts', { points: points(member.points, locale) }),
            t('loyalty.member.joined', 'Joined {{day}}', { day: day(member.joined_at, locale, boot.venue.timezone) }),
            member.is_active ? null : t('loyalty.member.inactive', 'Account switched off'),
          ].filter(Boolean).join(' · ')}
        </span>
      </span>
    </label>
  )
}
