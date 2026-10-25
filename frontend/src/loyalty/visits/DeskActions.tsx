import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { LogIn, ShoppingBag } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Field } from '../../workspace/ui/Field'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { money } from '../lib/format'
import type { MemberRow } from '../lib/types'
import { useFirstFocus } from '../lib/useFirstFocus'
import { ERRORS } from './errors'
import { afterDeskVisit, visitsApi, type DeskAnswer } from './visitsApi'
import { amountProblem, deskButtons, deskSentences, parseAmount, problemSentence, type DeskKind } from './visitsMath'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Check in and Add a purchase (release 7, spec 2026-10-25 §2), on the Scan result and a member's page: each when the
 * venue uses it and the person may award points. The answer is said in sentences ("+1 stamp — 7 of 10", "+45 points",
 * "+€2.25 credit", "Already checked in today"). A press keeps its key until it is answered, so a retry after a lost
 * answer writes nothing new.
 */
export function DeskActions({ member }: { member: MemberRow & { is_erased?: boolean } }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const client = useQueryClient()
  const buttons = deskButtons(boot.programme.ways, boot.staff.can, member)
  const [key, setKey] = useState(newPressKey)
  const [shown, setShown] = useState<{ kind: DeskKind; answer: DeskAnswer } | null>(null)
  const [buying, setBuying] = useState(false)

  const checkIn = useMutation({
    mutationFn: () => visitsApi.checkIn(member.id, { idempotency_key: key }),
    onMutate: () => setShown(null),
    onSuccess: (answer) => {
      setShown({ kind: 'check_in', answer })
      setKey(newPressKey())
      afterDeskVisit(client, member.id)
    },
  })
  if (!buttons.checkIn && !buttons.purchase) return null
  const failure = checkIn.isError ? failureOf(checkIn.error) : null

  return (
    <div className="space-y-2" data-desk="">
      <div className="flex flex-wrap gap-2">
        {buttons.checkIn && (
          <Button variant="secondary" loading={checkIn.isPending} onClick={() => checkIn.mutate()}>
            <LogIn size={15} aria-hidden />{t('loyalty.visits.check_in', 'Check in')}
          </Button>
        )}
        {buttons.purchase && (
          <Button variant="secondary" onClick={() => { setShown(null); checkIn.reset(); setBuying(true) }}>
            <ShoppingBag size={15} aria-hidden />{t('loyalty.visits.add_purchase', 'Add a purchase')}
          </Button>
        )}
      </div>
      {shown && <DeskOutcome answer={shown.answer} kind={shown.kind} />}
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.visits', ERRORS, 'desk', failure))}</Notice>}
      {buying && (
        <PurchaseDialog member={member} onClose={() => setBuying(false)}
          onDone={(answer) => { setBuying(false); setShown({ kind: 'purchase', answer }) }} />
      )}
    </div>
  )
}

/** The desk's answer, one sentence a line. */
export function DeskOutcome({ answer, kind }: { answer: DeskAnswer; kind: DeskKind }) {
  const { t, i18n } = useTranslation()
  const sentences = deskSentences(answer, kind, i18n.language || 'en')
  return (
    <Notice tone={answer.already_today && sentences.length === 1 ? 'info' : 'success'}>
      <ul className="space-y-0.5">
        {sentences.map(s => <li key={s.key}>{t(s.key, s.fallback, s.vars)}</li>)}
      </ul>
    </Notice>
  )
}

/** Add a purchase: the amount in the venue's currency and a note; one key per opening, as Award's. */
function PurchaseDialog({ member, onClose, onDone }: { member: MemberRow; onClose: () => void; onDone: (answer: DeskAnswer) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const client = useQueryClient()
  const currency = boot.venue.currency
  const ways = boot.programme.ways
  const [key] = useState(newPressKey)
  const [typed, setTyped] = useState('')
  const [note, setNote] = useState('')
  const [tried, setTried] = useState(false)
  const first = useFirstFocus<HTMLInputElement>()

  const save = useMutation({
    mutationFn: () => visitsApi.checkIn(member.id, { amount: parseAmount(typed) ?? 0, ...(note.trim() ? { note: note.trim() } : {}), idempotency_key: key }),
    onSuccess: (answer) => {
      afterDeskVisit(client, member.id)
      onDone(answer)
    },
  })
  const problem = amountProblem(typed, currency)
  const amount = problem === null ? parseAmount(typed) : null
  const failure = save.isError ? failureOf(save.error) : null
  const hint = ways?.cashback
    ? t('loyalty.visits.amount_hint_cashback', 'Earns points at your rate, and {{percent}}% back as credit.', { percent: String(ways.cashback_percent) })
    : t('loyalty.visits.amount_hint', 'Earns points at your rate.')

  return (
    <Dialog title={t('loyalty.visits.purchase_title', 'Add a purchase for {{name}}', { name: member.name || member.member_number || '' })} onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (problem === null) save.mutate()
      }}>
        <Field label={t('loyalty.visits.amount', 'Amount ({{currency}})', { currency })} hint={hint}>
          <input type="text" inputMode="decimal" autoComplete="off" value={typed} ref={first} onChange={(e) => setTyped(e.target.value)}
            className={INPUT} aria-invalid={tried && problem !== null} />
        </Field>
        <Field label={t('loyalty.visits.note', 'Note (optional)')} hint={t('loyalty.visits.note_hint', 'Shows on the points line in the member’s history.')}>
          <input type="text" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} className={INPUT}
            placeholder={t('loyalty.visits.note_example', 'e.g. Lunch for two')} />
        </Field>

        {amount !== null && <p className="text-sm text-a-text-2">{t('loyalty.visits.amount_is', 'A purchase of {{amount}}', { amount: money(amount, currency, locale) })}</p>}
        {tried && problem !== null && (() => { const s = problemSentence(problem, currency, locale); return <Notice tone="warning">{t(s.key, s.fallback, s.vars)}</Notice> })()}
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.visits', ERRORS, 'desk', failure))}</Notice>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>{t('loyalty.common.cancel', 'Cancel')}</Button>
          <Button type="submit" loading={save.isPending}><ShoppingBag size={15} aria-hidden />{t('loyalty.visits.add', 'Add the purchase')}</Button>
        </div>
      </form>
    </Dialog>
  )
}
