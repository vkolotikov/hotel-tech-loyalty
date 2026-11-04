import { useState } from 'react'
import { Text } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, afterMemberChange, useBoot } from '../lib/queries'
import { purchaseAmount, deskFlow } from '../lib/desk'
import { useDeskAttempt } from '../lib/useDeskAttempt'
import { feel } from '../lib/haptics'
import { day, money, number } from '../lib/format'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import type { DeskAnswer } from '../lib/types'
import { C, fonts } from '../lib/theme'
import { Field, GoldButton, IconBadge, Notice, Row } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { MemberSummary } from '../components/MemberCard'
import { Done } from '../components/Done'

/** Two presentation flows, one server desk operation and one durable attempt scope. */
export default function CheckIn() {
  const { t, language } = useT()
  const params = useLocalSearchParams<{ id: string; mode?: string }>()
  const id = Number(params.id)
  const boot = useBoot()
  const detail = useQuery({ queryKey: KEYS.member(id), queryFn: () => api.member(id), enabled: id > 0 })
  const [mode, setMode] = useState<'purchase' | 'visit'>(params.mode === 'purchase' ? 'purchase' : 'visit')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [validation, setValidation] = useState<Key | null>(null)
  const [done, setDone] = useState<DeskAnswer | null>(null)
  const attempt = useDeskAttempt(id, 'checkin', saved => {
    setAmount(saved.amount === null ? '' : String(saved.amount))
    setMode(saved.amount === null ? 'visit' : 'purchase')
    setNote(saved.note)
  })
  const { busy, failure, pending } = attempt
  const currency = boot.data?.venue.currency ?? 'EUR'
  const spent = mode === 'purchase' ? purchaseAmount(amount, currency) : null
  const flow = deskFlow(mode, boot.data?.staff.can.award ?? false, boot.data?.programme.ways, spent)
  const title = t(mode === 'purchase' ? 'purchase.title' : 'checkIn.title')

  const send = async () => {
    if (busy || !flow.allowed || !detail.data) return
    setValidation(null)
    if (!pending && flow.problem) return setValidation(flow.problem)
    if (spent === 'invalid') return
    const answer = await attempt.send(spent, note.trim(), saved => api.checkIn(id, saved.amount, saved.note, saved.key))
    if (answer) { feel.success(); afterMemberChange(id); setDone(answer) }
  }

  if (done) {
    const lines: string[] = [detail.data?.member.name ?? '']
    const gained = done.points.checkin + done.points.purchase
    if (done.already_today && gained === 0) lines.push(t('checkIn.already'))
    if (gained > 0) lines.push(t('checkIn.points', { n: number(gained, language) }))
    if (done.stamp?.card) lines.push(t('checkIn.stamp', { have: done.stamp.card.stamps_count, need: done.stamp.card.stamps_needed }))
    if (done.credit) lines.push(t('checkIn.credit', { amount: money(done.credit.amount, done.credit.currency, language) }))
    lines.push(t('common.points', { n: number(done.points.balance, language) }))
    return <Sheet title={title} footer={<GoldButton title={t('common.done')} icon="checkmark" onPress={() => router.back()} />}>
      <Done title={t(mode === 'purchase' ? 'purchase.done' : 'checkIn.done')} lines={lines} />
    </Sheet>
  }
  return <Sheet title={title} busy={busy} footer={<GoldButton
    title={pending ? t('common.retry') : mode === 'purchase' ? (typeof spent === 'number' ? t('purchase.confirmAmount', { amount: money(spent, currency, language) }) : t('purchase.title')) : t('checkIn.confirm')}
    icon={mode === 'purchase' ? 'receipt-outline' : 'checkmark'} busy={busy}
    disabled={!attempt.ready || !flow.allowed || !detail.data} onPress={() => { void send() }} />}>
    {detail.data && <MemberSummary member={detail.data.member} />}
    {mode === 'purchase' ? <Field label={t('purchase.amount', { currency })} value={amount} onChangeText={setAmount} editable={!pending && !busy} keyboardType="decimal-pad" placeholder={money(0, currency, language)} /> :
      <Row card title={boot.data?.organization.name ?? t('scan.desk')} line={boot.data ? day(boot.data.venue.today, language) : undefined} left={<IconBadge name="location-outline" />} />}
    <Field label={t('checkIn.note')} value={note} onChangeText={setNote} editable={!pending && !busy} maxLength={200} />
    <Text style={[fonts.small, { color: C.text2 }]}>{t(mode === 'purchase' ? 'purchase.hint' : 'checkIn.shortHint')}</Text>
    {validation && <Notice text={t(validation)} />}
    {pending && !failure && <Notice tone="warning" text={t('error.unconfirmed')} />}
    {boot.data && !flow.allowed && <Notice text={t('error.not_allowed')} />}
    {detail.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void detail.refetch() }} />}
    {failure && <Notice text={t(failure)} />}
  </Sheet>
}
