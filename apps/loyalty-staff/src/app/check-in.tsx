import { useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, afterMemberChange, useBoot } from '../lib/queries'
import { purchaseAmount } from '../lib/desk'
import { useDeskAttempt } from '../lib/useDeskAttempt'
import { feel } from '../lib/haptics'
import { money, number } from '../lib/format'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import type { DeskAnswer } from '../lib/types'
import { Field, GhostButton, GoldButton, Notice } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { Done } from '../components/Done'

/**
 * Check in at the desk (`POST members/{id}/check-in`): today's visit, and the amount spent when the venue gives points
 * or cashback for purchases at the desk. What it gives — check-in points, a stamp, cashback — is the server's, said after.
 */
export default function CheckIn() {
  const { t, language } = useT()
  const params = useLocalSearchParams<{ id: string }>()
  const id = Number(params.id)
  const boot = useBoot()
  const detail = useQuery({ queryKey: KEYS.member(id), queryFn: () => api.member(id), enabled: id > 0 })
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState<Key | null>(null)
  const [done, setDone] = useState<DeskAnswer | null>(null)
  const attempt = useDeskAttempt(id, 'checkin', saved => { setAmount(saved.amount === null ? '' : String(saved.amount)); setNote(saved.note) })
  const { busy, failure, pending } = attempt
  const ways = boot.data?.programme.ways
  const currency = boot.data?.venue.currency ?? 'EUR'
  const spent = purchaseAmount(amount, currency)
  const allowed = !!boot.data?.staff.can.award && !!(ways?.checkin || ways?.desk_earn)

  const send = async () => {
    if (busy || !allowed || !detail.data) return
    setValidation(null)
    if (spent === 'invalid') return setValidation('checkIn.invalidAmount')
    if (!pending && spent === null && !ways?.checkin) return setValidation('error.amount_required')
    const answer = await attempt.send(spent, note.trim(), saved => api.checkIn(id, saved.amount, saved.note, saved.key))
    if (answer) {
      feel.success()
      afterMemberChange(id)
      setDone(answer)
    }
  }

  if (done) {
    const lines: string[] = []
    const gained = done.points.checkin + done.points.purchase
    if (done.already_today && gained === 0) lines.push(t('checkIn.already'))
    if (gained > 0) lines.push(t('checkIn.points', { n: number(gained, language) }))
    if (done.stamp && done.stamp.card) lines.push(t('checkIn.stamp', { have: done.stamp.card.stamps_count, need: done.stamp.card.stamps_needed }))
    if (done.credit) lines.push(t('checkIn.credit', { amount: money(done.credit.amount, done.credit.currency, language) }))
    lines.push(t('common.points', { n: number(done.points.balance, language) }))
    return (
      <Sheet title={t('checkIn.title')}>
        <Done title={t('checkIn.done')} lines={lines} />
        <GoldButton title={t('common.done')} icon="checkmark" onPress={() => router.back()} />
      </Sheet>
    )
  }

  return (
    <Sheet title={t('checkIn.title')} line={detail.data ? `${detail.data.member.name} · ${t('checkIn.line')}` : t('checkIn.line')}>
      {ways?.desk_earn && (
        <Field label={t(ways.checkin ? 'checkIn.amount' : 'checkIn.amountRequired')} value={amount} onChangeText={setAmount} editable={!pending && !busy} keyboardType="decimal-pad" placeholder={money(0, currency, language)} />
      )}
      <Field label={t('checkIn.note')} value={note} onChangeText={setNote} editable={!pending && !busy} maxLength={200} />
      {validation && <Notice text={t(validation)} />}
      {pending && !failure && <Notice tone="warning" text={t('error.unconfirmed')} />}
      {boot.data && !allowed && <Notice text={t('error.not_allowed')} />}
      {detail.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void detail.refetch() }} />}
      {failure && <Notice text={t(failure)} />}
      <GoldButton title={t(pending ? 'common.retry' : 'checkIn.confirm')} icon="walk" busy={busy} disabled={!attempt.ready || !allowed || !detail.data} onPress={() => { void send() }} />
      <GhostButton title={t('common.cancel')} onPress={() => router.back()} />
    </Sheet>
  )
}
