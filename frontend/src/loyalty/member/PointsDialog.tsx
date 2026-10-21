import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { errorKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { points } from '../lib/format'
import { POINTS_PROBLEM_WORDS } from '../lib/words'
import { balanceAfter, pointsProblem, type PointsMode } from './memberMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Award or redeem points (spec 2026-10-21 §4.3): the points, a reason, and the balance the member will have — checked
 * before sending, then by the server. One key per opening of the dialog: a retry after a lost answer writes nothing new.
 */
export function PointsDialog({ mode, memberId, name, balance, onClose }: { mode: PointsMode; memberId: number; name: string; balance: number; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
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
  })

  const problem = pointsProblem(mode, typed, reason, balance)
  const after = balanceAfter(mode, balance, typed)
  const failure = save.isError ? failureOf(save.error) : null
  const title = mode === 'award' ? t('loyalty.member.award_title', 'Award points to {{name}}', { name }) : t('loyalty.member.redeem_title', 'Redeem points of {{name}}', { name })

  return (
    <Dialog title={title} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (problem === null) save.mutate()
      }}>
        <Field label={t('loyalty.member.points', 'Points')}>
          <input type="number" inputMode="numeric" min={1} max={100000} step={1} value={typed} ref={first}
            onChange={(e) => setTyped(e.target.value)} className={INPUT} aria-invalid={tried && (problem === 'points' || problem === 'too_many' || problem === 'over_balance')} />
        </Field>
        <Field label={t('loyalty.member.reason', 'Reason')} hint={t('loyalty.member.reason_hint', 'Shows in the member’s history and the app.')}>
          <input type="text" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} className={INPUT}
            placeholder={mode === 'award' ? t('loyalty.member.reason_award_example', 'e.g. Welcome back') : t('loyalty.member.reason_redeem_example', 'e.g. Free coffee')}
            aria-invalid={tried && problem === 'reason'} />
        </Field>

        <p data-after="" className="text-sm text-a-text-2">
          {after === null
            ? t('loyalty.member.balance_now', 'Balance now: {{points}} points', { points: points(balance, locale) })
            : t('loyalty.member.balance_after', 'Balance after: {{points}} points', { points: points(after, locale) })}
        </p>

        {tried && problem !== null && (
          <Notice tone="warning">{t(`loyalty.member.problem.${problem}`, POINTS_PROBLEM_WORDS[problem], { balance: points(balance, locale) })}</Notice>
        )}
        {failure && (
          <Notice tone="danger">{t(...errorKey('points', failure), { balance: points(Number(failure.extra.balance ?? balance), locale) })}</Notice>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending}>
            {mode === 'award' ? t('loyalty.member.award', 'Award points') : t('loyalty.member.redeem', 'Redeem points')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
