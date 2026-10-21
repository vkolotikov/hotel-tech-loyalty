import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points, when } from '../lib/format'
import { memberPath } from '../lib/links'
import type { Can } from '../lib/types'
import { ConfirmDialog, Toggle, ToneBadge } from '../ui/formParts'
import { named } from '../lib/forms'
import { Pager } from '../ui/Pager'
import { afterRedemption, redemptionsKey, rewardsApi } from './api'
import { ERRORS } from './errors'
import { Empty, LoadFailed, Loading, TabHead } from './parts'
import { REDEMPTION_FILTERS, redemptionActions, redemptionTone } from './rewardsMath'
import type { Redemption, RedemptionFilter } from './types'
import { REDEMPTION_FILTER_WORDS, REDEMPTION_STATE_WORDS } from './words'

/**
 * Redemptions (spec 2026-10-21 §4.6): the codes members bring to the desk, pending first, 25 a page. Whoever may
 * redeem points marks a pending one fulfilled or cancels it — a cancel gives the points back, so it asks first. When
 * someone else handled it meanwhile, the list says so and is read again.
 */
export function RedemptionsTab({ redeem }: { redeem: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const client = useQueryClient()
  const [filter, setFilter] = useState<RedemptionFilter>('pending')
  const [page, setPage] = useState(1)
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const [cancelling, setCancelling] = useState<Redemption | null>(null)
  const query = useQuery({ queryKey: redemptionsKey(filter, page), queryFn: () => rewardsApi.redemptions(filter, page), placeholderData: keepPreviousData })
  const data = query.data

  const fulfil = useMutation({
    mutationFn: (r: Redemption) => rewardsApi.fulfil(r.id),
    onMutate: () => setFailure(null),
    onSuccess: (_, r) => afterRedemption(client, r.member?.id ?? null),
    onError: (error, r) => { setFailure(failureOf(error)); afterRedemption(client, r.member?.id ?? null) },
  })
  const choose = (next: RedemptionFilter) => { setFilter(next); setPage(1); setFailure(null) }

  return (
    <>
      <TabHead line={<>
        <p>{t('loyalty.rewards.redemptions.line', 'Codes members show at the desk for a reward.')}</p>
        {!redeem && <p data-read-only="">{t('loyalty.rewards.redemptions.read_only', 'Only staff allowed to redeem points can fulfil or cancel a redemption.')}</p>}
      </>} />

      <div role="group" aria-label={t('loyalty.rewards.redemptions.filter', 'Show')} className="flex flex-wrap gap-2">
        {REDEMPTION_FILTERS.map(name => (
          <Toggle key={name} on={filter === name} onClick={() => choose(name)}>
            {t(`loyalty.rewards.redemption_filter.${name}`, REDEMPTION_FILTER_WORDS[name])}
            {name === 'pending' && data && <span className="tabular-nums">{points(data.counts.pending, locale)}</span>}
          </Toggle>
        ))}
      </div>

      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.rewards', ERRORS, 'redemption', failure))}</Notice>}
      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && data.redemptions.length === 0 && (
        <Empty>{filter === 'pending' ? t('loyalty.rewards.redemptions.none_pending', 'Nothing waits at the desk.') : t('loyalty.rewards.redemptions.none', 'No redemptions here yet.')}</Empty>
      )}
      {data && data.redemptions.length > 0 && (
        <>
          <ul className={`divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface ${query.isFetching ? 'opacity-80' : ''}`}>
            {data.redemptions.map(r => (
              <RedemptionRow key={r.id} redemption={r} can={boot.staff.can} locale={locale} timeZone={boot.venue.timezone}
                fulfilling={fulfil.isPending && fulfil.variables?.id === r.id} busy={fulfil.isPending}
                onFulfil={() => fulfil.mutate(r)} onCancel={() => { setFailure(null); setCancelling(r) }} />
            ))}
          </ul>
          <Pager page={data.page} pages={data.pages} onPage={setPage} />
        </>
      )}

      {cancelling && <CancelRedemption redemption={cancelling} onClose={() => setCancelling(null)} />}
    </>
  )
}

/** One redemption: its code, the member, the reward, the points, when, where it stands, and its next steps. */
export function RedemptionRow({ redemption: r, can, locale, timeZone, fulfilling, busy, onFulfil, onCancel }: {
  redemption: Redemption; can: Can; locale: string; timeZone: string; fulfilling: boolean; busy: boolean; onFulfil: () => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  const actions = redemptionActions(r.state, can)
  const state = named('loyalty.rewards.redemption_state', REDEMPTION_STATE_WORDS, r.state)

  return (
    <li data-redemption={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <span className="w-28 shrink-0 font-a-mono text-sm font-semibold text-a-text">{r.code}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-a-text">{r.reward?.name ?? t('loyalty.rewards.redemptions.unknown_reward', 'A reward no longer in the catalogue')}</p>
        <p className="text-xs text-a-text-2">
          {r.member
            ? <Link to={memberPath(r.member.id)} className="text-a-accent-text hover:underline">{r.member.name || r.member.member_number || `#${r.member.id}`}</Link>
            : t('loyalty.rewards.redemptions.no_member', 'Member no longer in the programme')}
          {r.at && <> · {when(r.at, locale, timeZone)}</>}
        </p>
      </div>
      <span className="text-sm font-semibold tabular-nums text-a-text">{t('loyalty.common.points_count', '{{points}} pts', { points: points(r.points, locale) })}</span>
      <ToneBadge tone={redemptionTone(r.state)}>{state ? t(...state) : r.state}</ToneBadge>
      {(actions.fulfil || actions.cancel) && (
        <div className="flex flex-wrap gap-2">
          {actions.fulfil && (
            <Button size="sm" loading={fulfilling} disabled={busy} onClick={onFulfil}>
              {t('loyalty.rewards.redemptions.fulfil', 'Mark fulfilled')}<span className="sr-only"> {r.code}</span>
            </Button>
          )}
          {actions.cancel && (
            <Button size="sm" variant="secondary" disabled={busy} onClick={onCancel}>
              {t('loyalty.rewards.redemptions.cancel', 'Cancel')}<span className="sr-only"> {r.code}</span>
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

/** Cancel a pending redemption, once asked: the points go back to the member and the reward to its stock. */
function CancelRedemption({ redemption: r, onClose }: { redemption: Redemption; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const client = useQueryClient()
  const cancel = useMutation({
    mutationFn: () => rewardsApi.cancel(r.id),
    onSuccess: () => { afterRedemption(client, r.member?.id ?? null); onClose() },
    onError: () => afterRedemption(client, r.member?.id ?? null),
  })
  const failure = cancel.isError ? failureOf(cancel.error) : null
  return (
    <ConfirmDialog title={t('loyalty.rewards.cancel.title', 'Cancel redemption {{code}}?', { code: r.code })}
      confirm={t('loyalty.rewards.cancel.confirm', 'Cancel redemption')} keep={t('loyalty.rewards.cancel.keep', 'Keep it')}
      busy={cancel.isPending} failure={failure && t(...refusalKey('loyalty.rewards', ERRORS, 'redemption', failure))}
      onConfirm={() => cancel.mutate()} onClose={onClose}>
      <p>{t('loyalty.rewards.cancel.body', '{{points}} points go back to {{name}}, and the reward returns to stock if it has a limit. The code stops working.', {
        points: points(r.points, i18n.language || 'en'), name: r.member?.name || r.member?.member_number || '—',
      })}</p>
    </ConfirmDialog>
  )
}
