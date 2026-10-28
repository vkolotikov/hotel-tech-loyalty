import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { errorKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { points } from '../lib/format'
import { POINTS_PROBLEM_WORDS } from '../lib/words'
import { DesignDialog, NumberControl } from '../redesign/DesignUI'
import { OverviewButton } from '../overview/OverviewUI'
import { useRedesignWords } from '../redesign/words'
import { steppedValue } from '../redesign/designMath'
import { initials } from '../members/membersQuery'
import { balanceAfter, pointsProblem, type PointsMode } from './memberMath'
import { useScanWords } from '../scan/design/words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Award or redeem points (spec 2026-10-21 §4.3): the points, a reason, and the balance the member will have — checked
 * before sending, then by the server. One key per opening of the dialog: a retry after a lost answer writes nothing new.
 */
export function PointsDialog({ mode, memberId, name, balance, onClose, memberNumber, level, inline = false, onBusyChange }: { mode: PointsMode; memberId: number; name: string; balance: number; onClose: () => void; memberNumber?: string | null; level?: string; inline?: boolean; onBusyChange?: (busy: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const say = useRedesignWords()
  const scanWords = useScanWords()
  const queryClient = useQueryClient()
  const [key] = useState(newPressKey)
  const [typed, setTyped] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const first = useFirstFocus<HTMLInputElement>()

  const save = useMutation({
    mutationFn: () => (mode === 'award' ? api.award : api.redeem)(memberId, { points: Number(typed), reason: reason.trim(), idempotency_key: key }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'member', memberId] })
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'history', memberId] })
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'members'] })
      onClose()
    },
    onSettled: () => onBusyChange?.(false),
  })

  const problem = pointsProblem(mode, typed, reason, balance)
  useEffect(() => () => onBusyChange?.(false), [onBusyChange])
  const after = balanceAfter(mode, balance, typed)
  const failure = save.isError ? failureOf(save.error) : null
  const title = mode === 'award' ? t('loyalty.member.award', 'Award points') : t('loyalty.member.redeem', 'Redeem points')

  const form = (
      <form className="l-rd-form l-rd-points-form" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (problem === null && !save.isPending) { onBusyChange?.(true); save.mutate() }
      }}>
        <p>{say(mode === 'award' ? 'awardLine' : 'redeemLine')}</p>
        {!inline && <div className="l-rd-person-inset"><span className="l-rd-avatar" aria-hidden>{initials(name)}</span><span><strong>{name}</strong><small>{[level, memberNumber].filter(Boolean).join(' · ')}</small></span></div>}
        <div><span className="l-rd-label">{say(mode === 'award' ? 'pointsAdd' : 'pointsUse')}</span><NumberControl label={say(mode === 'award' ? 'pointsAdd' : 'pointsUse')} value={typed} onValue={setTyped} min={1} max={100000} inputRef={first} disabled={save.isPending} invalid={tried && (problem === 'points' || problem === 'too_many' || problem === 'over_balance')} /></div>
        <div className="l-rd-quick-add"><small>{say('quickAdd')}</small>{[50, 100, 250].map(n => <OverviewButton key={n} type="button" disabled={save.isPending} onClick={() => setTyped(steppedValue(typed, n, 1, 100000))}>+{n}</OverviewButton>)}</div>
        <small>{say('stepHint')}</small>
        <Field label={t('loyalty.member.reason', 'Reason')} hint={t('loyalty.member.reason_hint', 'Shows in the member’s history and the app.')}>
          <input type="text" aria-label={t('loyalty.member.reason', 'Reason')} disabled={save.isPending} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={INPUT}
            placeholder={mode === 'award' ? t('loyalty.member.reason_award_example', 'e.g. Welcome back') : t('loyalty.member.reason_redeem_example', 'e.g. Free coffee')}
            aria-invalid={tried && problem === 'reason'} />
        </Field>

        <div className="l-rd-balance-preview" data-after=""><div><small>{say('currentBalance')}</small><strong>{t('loyalty.common.points_count', '{{points}} pts', { points: points(balance, locale) })}</strong></div><div><small>{say(mode === 'award' ? 'pointsAdd' : 'pointsUse')}</small><strong>{after === null ? '—' : `${mode === 'award' ? '+' : '−'}${points(Number(typed), locale)}`}</strong></div><div><small>{say('newBalance')}</small><strong>{after === null ? '—' : t('loyalty.common.points_count', '{{points}} pts', { points: points(after, locale) })}</strong></div></div>
        <small>{say('levelRules')}</small>

        {tried && problem !== null && (
          <Notice tone="warning">{t(`loyalty.member.problem.${problem}`, POINTS_PROBLEM_WORDS[problem], { balance: points(balance, locale) })}</Notice>
        )}
        {failure && (
          <Notice tone="danger">{t(...errorKey('points', failure), { balance: points(Number(failure.extra.balance ?? balance), locale) })}</Notice>
        )}

        <div className="l-rd-form-foot">
          <OverviewButton type="button" onClick={inline ? () => { setTyped(''); setReason(''); setTried(false) } : onClose} disabled={save.isPending}>{inline ? scanWords('clear') : t('loyalty.common.cancel', 'Cancel')}</OverviewButton>
          <OverviewButton type="submit" primary disabled={save.isPending} aria-busy={save.isPending}>
            {after === null ? title : say(mode === 'award' ? 'awardConfirm' : 'redeemConfirm', { n: points(Number(typed), locale) })}
          </OverviewButton>
        </div>
      </form>
  )
  return inline ? form : <DesignDialog title={title} onClose={onClose} busy={save.isPending}>{form}</DesignDialog>
}
