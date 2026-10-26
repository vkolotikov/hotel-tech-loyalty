import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Coins, Hourglass, Users } from 'lucide-react'
import { useBoot } from '../LoyaltyProvider'
import { points, when } from '../lib/format'
import { memberPath } from '../lib/links'
import { ToneBadge } from '../ui/formParts'
import { named } from '../lib/forms'
import { Pager } from '../ui/Pager'
import { referralsKey, rewardsApi } from './api'
import { Empty, LoadFailed, Loading, TabHead } from './parts'
import { referralTone } from './rewardsMath'
import type { Referral } from './types'
import { REFERRAL_STATE_WORDS } from './words'

/**
 * Referrals (spec 2026-10-21 §4.6): the numbers — how many, rewarded, pending, the points paid out — and the list,
 * newest first, 25 a page. Read only: a referral is written when a member joins through another's code.
 */
export function ReferralsTab() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const [page, setPage] = useState(1)
  const query = useQuery({ queryKey: referralsKey(page), queryFn: () => rewardsApi.referrals(page), placeholderData: keepPreviousData })
  const data = query.data
  const figures = data?.figures

  return (
    <>
      <TabHead line={<p>{t('loyalty.rewards.referrals.line', 'Members who joined through another member’s code.')}</p>} />

      {figures && (
        <dl data-figures="" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {([
            ['total', t('loyalty.rewards.referrals.total', 'Referrals'), figures.total, Users, 'offer'],
            ['rewarded', t('loyalty.rewards.referrals.rewarded', 'Rewarded'), figures.rewarded, CircleCheck, 'earn'],
            ['pending', t('loyalty.rewards.referrals.pending', 'Pending'), figures.pending, Hourglass, 'gift'],
            ['points', t('loyalty.rewards.referrals.points_paid', 'Points paid out'), figures.points_paid, Coins, 'bonus'],
          ] as const).map(([key, label, value, Icon, hue]) => (
            <div key={key} data-hue={hue} className="rounded-2xl border border-a-border bg-a-surface p-4">
              <dt className="flex items-center gap-2 text-xs text-a-text-2">
                <span aria-hidden className="l-hue-tile inline-flex h-7 w-7 items-center justify-center rounded-lg"><Icon size={15} /></span>{label}
              </dt>
              <dd className="mt-1 font-a-display text-3xl font-light tabular-nums text-a-text">{points(value, locale)}</dd>
            </div>
          ))}
        </dl>
      )}

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.referrals.length === 0 && <Empty>{t('loyalty.rewards.referrals.none', 'No referrals yet. Members find their code in the app.')}</Empty>}
      {data && data.referrals.length > 0 && (
        <>
          <ul className={`divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-80' : ''}`}>
            {data.referrals.map(r => <ReferralRow key={r.id} referral={r} locale={locale} timeZone={boot.venue.timezone} />)}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}
    </>
  )
}

/** One referral: who joined, whose code brought them, the points each was given, and where it stands. */
export function ReferralRow({ referral: r, locale, timeZone }: { referral: Referral; locale: string; timeZone: string }) {
  const { t } = useTranslation()
  const state = named('loyalty.rewards.referral_state', REFERRAL_STATE_WORDS, r.state)
  const person = (who: Referral['referee']) => (who
    ? <Link to={memberPath(who.id)} className="text-a-accent-text hover:underline">{who.name || `#${who.id}`}</Link>
    : <span>{t('loyalty.rewards.referrals.gone', 'No longer a member')}</span>)

  return (
    <li data-referral={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{person(r.referee)}</p>
        <p className="text-xs text-a-text-2">
          {t('loyalty.rewards.referrals.from', 'Invited by')} {person(r.referrer)}
          {r.at && <> · {when(r.at, locale, timeZone)}</>}
        </p>
      </div>
      <span className="text-xs tabular-nums text-a-text-2">
        {t('loyalty.rewards.referrals.points', 'Points: +{{referrer}} to the referrer, +{{referee}} to the new member', {
          referrer: points(r.points.referrer, locale), referee: points(r.points.referee, locale),
        })}
      </span>
      <ToneBadge tone={referralTone(r.state)}>{state ? t(...state) : r.state}</ToneBadge>
    </li>
  )
}
