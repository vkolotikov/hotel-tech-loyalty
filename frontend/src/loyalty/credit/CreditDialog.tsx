import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { money } from '../lib/format'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterCreditChange, creditApi, type CreditAfter } from './creditApi'
import { creditAfter, creditProblem, currencyDecimals, parseAmount, type CreditMode } from './creditMath'
import { ERRORS } from './errors'
import { PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Use credit at the desk, or a manager's correction (release 7, spec 2026-10-25 §3, R7-2): the amount in the venue's
 * currency (prefilled with nothing), a note or the reason, and the credit the member will have — checked before
 * sending as a hint, then by the server, whose refusal names the balance under its lock. One key per opening of the
 * dialog: a retry after a lost answer takes nothing off twice.
 */
export function CreditDialog({ mode, memberId, name, balance, currency, onClose, onDone }: {
  mode: CreditMode
  memberId: number
  name: string
  balance: number
  currency: string
  onClose: () => void
  onDone: (after: CreditAfter) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const client = useQueryClient()
  const [key] = useState(newPressKey)
  const [typed, setTyped] = useState('')
  const [text, setText] = useState('')
  const [tried, setTried] = useState(false)
  const first = useFirstFocus<HTMLInputElement>()
  const decimals = currencyDecimals(currency)

  const save = useMutation({
    mutationFn: () => {
      const amount = parseAmount(typed) ?? 0
      return mode === 'use'
        ? creditApi.spend(memberId, { amount, ...(text.trim() !== '' ? { note: text.trim() } : {}), idempotency_key: key })
        : creditApi.adjust(memberId, { amount, reason: text.trim(), idempotency_key: key })
    },
    onSuccess: (after) => {
      afterCreditChange(client, memberId)
      onDone(after)
    },
  })

  const problem = creditProblem(mode, typed, text, balance, decimals)
  const after = creditAfter(mode, balance, typed, decimals)
  const failure = save.isError ? failureOf(save.error) : null
  const shown = (amount: number) => money(amount, currency, locale)
  const title = mode === 'use'
    ? t('loyalty.credit.use_title', 'Use credit of {{name}}', { name })
    : t('loyalty.credit.adjust_title', 'Correct the credit of {{name}}', { name })

  return (
    <Dialog title={title} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (problem === null && !save.isPending) save.mutate()
      }}>
        <Field label={t('loyalty.credit.amount', 'Amount ({{currency}})', { currency })}
          hint={mode === 'adjust' ? t('loyalty.credit.adjust_hint', 'A minus sign takes credit off, e.g. -5.') : undefined}>
          <input type="number" inputMode="decimal" step={decimals === 0 ? 1 : 0.01} min={mode === 'use' ? 0 : undefined} value={typed} ref={first}
            onChange={(e) => setTyped(e.target.value)} className={INPUT}
            aria-invalid={tried && problem !== null && problem !== 'reason'} />
        </Field>
        {mode === 'use' ? (
          <Field label={t('loyalty.credit.note', 'Note (optional)')} hint={t('loyalty.credit.note_hint', 'The member sees it in their credit history.')}>
            <input type="text" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className={INPUT}
              placeholder={t('loyalty.credit.note_example', 'e.g. Lunch for two')} />
          </Field>
        ) : (
          <Field label={t('loyalty.credit.reason', 'Reason')} hint={t('loyalty.credit.note_hint', 'The member sees it in their credit history.')}>
            <input type="text" value={text} maxLength={200} onChange={(e) => setText(e.target.value)} className={INPUT}
              placeholder={t('loyalty.credit.reason_example', 'e.g. Cashback missed on a visit')} aria-invalid={tried && problem === 'reason'} />
          </Field>
        )}

        <p data-after="" className="text-sm text-a-text-2">
          {after === null
            ? t('loyalty.credit.balance_now', 'Credit now: {{amount}}', { amount: shown(balance) })
            : t('loyalty.credit.balance_then', 'Credit after: {{amount}}', { amount: shown(after) })}
        </p>

        {tried && problem !== null && (
          <Notice tone="warning">{t(`loyalty.credit.${mode}.problem.${problem}`, PROBLEM_WORDS[mode][problem], { balance: shown(balance) })}</Notice>
        )}
        {failure && (
          <Notice tone="danger">{t(...refusalKey('loyalty.credit', ERRORS, mode, failure), { balance: shown(Number(failure.extra.balance ?? balance)) })}</Notice>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending}>
            {mode === 'use' ? t('loyalty.credit.use_do', 'Take off credit') : t('loyalty.credit.adjust_do', 'Save the correction')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
