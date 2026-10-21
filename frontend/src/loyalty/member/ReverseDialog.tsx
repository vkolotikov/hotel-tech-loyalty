import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useApi } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { errorKey } from '../lib/errors'
import { useFirstFocus } from '../lib/useFirstFocus'
import { points, signedPoints } from '../lib/format'
import type { LedgerLine } from '../lib/types'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * A manager undoes one line of the member's history (spec 2026-10-21 §4.3): the dialog says what it does to the
 * balance — a reversal may leave it below zero when the points were spent meanwhile — and asks why.
 */
export function ReverseDialog({ memberId, line, balance, onClose }: { memberId: number; line: LedgerLine; balance: number; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const api = useApi()
  const queryClient = useQueryClient()
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const first = useFirstFocus<HTMLInputElement>()

  const reverse = useMutation({
    mutationFn: () => api.reverse(memberId, line.id, reason.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'member', memberId] })
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'history', memberId] })
      void queryClient.invalidateQueries({ queryKey: ['loyalty', 'members'] })
      onClose()
    },
    onError: () => { void queryClient.invalidateQueries({ queryKey: ['loyalty', 'history', memberId] }) },
  })

  const after = balance - line.points
  const failure = reverse.isError ? failureOf(reverse.error) : null
  const short = reason.trim().length < 2

  return (
    <Dialog title={t('loyalty.history.reverse_title', 'Reverse {{points}} points', { points: signedPoints(line.points, locale) })} onClose={onClose} busy={reverse.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (!short) reverse.mutate()
      }}>
        <p className="text-sm text-a-text">“{line.description}”</p>
        <p data-after="" className="text-sm text-a-text-2">
          {t('loyalty.history.reverse_effect', 'The balance goes from {{now}} to {{after}} points. The line stays in the history, marked reversed.', { now: points(balance, locale), after: points(after, locale) })}
        </p>
        {after < 0 && <Notice tone="warning">{t('loyalty.history.reverse_negative', 'The member has spent some of these points: the balance will be below zero until they earn more.')}</Notice>}
        <Field label={t('loyalty.history.reverse_reason', 'Why')}>
          <input type="text" value={reason} maxLength={200} ref={first} onChange={(e) => setReason(e.target.value)} className={INPUT}
            placeholder={t('loyalty.history.reverse_example', 'e.g. Awarded to the wrong member')} aria-invalid={tried && short} />
        </Field>
        {tried && short && <Notice tone="warning">{t('loyalty.history.reverse_needs_reason', 'Say why, in a few words.')}</Notice>}
        {failure && <Notice tone="danger">{t(...errorKey('reverse', failure))}</Notice>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={reverse.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="submit" variant="danger" loading={reverse.isPending}>{t('loyalty.history.reverse', 'Reverse')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
