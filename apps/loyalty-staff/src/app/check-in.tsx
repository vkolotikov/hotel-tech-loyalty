import { useRef, useState } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, afterMemberChange, useBoot } from '../lib/queries'
import { failureOf } from '../lib/failure'
import { errorKey } from '../lib/desk'
import { freshKey } from '../lib/ids'
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
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Key | null>(null)
  const [done, setDone] = useState<DeskAnswer | null>(null)
  const attempt = useRef<{ key: string; sig: string } | null>(null)
  const ways = boot.data?.programme.ways
  const currency = boot.data?.venue.currency ?? 'EUR'
  const spent = Number(amount.replace(',', '.'))

  const send = async () => {
    if (busy) return
    const value = Number.isFinite(spent) && spent > 0 ? Math.round(spent * 100) / 100 : null
    const sig = `${value}|${note.trim()}`
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { key: freshKey(), sig }
    setBusy(true)
    setFailure(null)
    try {
      const answer = await api.checkIn(id, value, note.trim(), attempt.current.key)
      attempt.current = null
      feel.success()
      afterMemberChange(id)
      setDone(answer)
    } catch (error) {
      const code = failureOf(error).code
      if (code !== 'network') attempt.current = null
      feel.warning()
      setFailure(errorKey(code))
    } finally {
      setBusy(false)
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
      {(ways?.desk_earn || ways?.cashback) && (
        <Field label={t('checkIn.amount')} value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder={money(0, currency, language)} />
      )}
      <Field label={t('checkIn.note')} value={note} onChangeText={setNote} maxLength={200} />
      {failure && <Notice text={t(failure)} />}
      <GoldButton title={t('checkIn.confirm')} icon="walk" busy={busy} onPress={() => { void send() }} />
      <GhostButton title={t('common.cancel')} onPress={() => router.back()} />
    </Sheet>
  )
}
