import { useRef, useState } from 'react'
import { StyleSheet, Text, TextInput, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'
import { KEYS, afterMemberChange } from '../lib/queries'
import { failureOf } from '../lib/failure'
import { balanceAfter, errorKey, pointsFrom, pointsProblem } from '../lib/desk'
import { freshKey } from '../lib/ids'
import { feel } from '../lib/haptics'
import { number } from '../lib/format'
import { useT } from '../lib/i18n'
import type { Key } from '../lib/i18n/en'
import { C, RADIUS, fonts } from '../lib/theme'
import { Field, GhostButton, GoldButton, NO_OUTLINE, Notice, Press, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'
import { Done } from '../components/Done'

const QUICK = [10, 25, 50, 100, 250]
const AWARD_REASONS: Key[] = ['points.reason.visit', 'points.reason.purchase', 'points.reason.goodwill', 'points.reason.correction']
const REDEEM_REASONS: Key[] = ['points.reason.reward', 'points.reason.correction']

/**
 * Give or use points: how many (typed or one of the quick amounts), why (a chip or own words, which the member reads
 * in their history), the balance after, then one press. The attempt keeps its key until an answer comes, so pressing
 * again after a lost connection never counts twice.
 */
export default function Points() {
  const { t, language } = useT()
  const params = useLocalSearchParams<{ id: string; mode: string }>()
  const id = Number(params.id)
  const mode: 'award' | 'redeem' = params.mode === 'redeem' ? 'redeem' : 'award'
  const detail = useQuery({ queryKey: KEYS.member(id), queryFn: () => api.member(id), enabled: id > 0 })
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [tried, setTried] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<Key | null>(null)
  const [done, setDone] = useState<{ points: number; balance: number } | null>(null)
  const attempt = useRef<{ key: string; sig: string } | null>(null)

  const balance = detail.data?.member.points ?? 0
  const points = pointsFrom(amount)
  const problem = pointsProblem(mode, points, reason, balance)
  const title = t(mode === 'award' ? 'points.awardTitle' : 'points.redeemTitle')

  const send = async () => {
    setTried(true)
    if (problem || busy) return
    const sig = `${mode}|${points}|${reason.trim()}`
    if (!attempt.current || attempt.current.sig !== sig) attempt.current = { key: freshKey(), sig }
    setBusy(true)
    setFailure(null)
    try {
      const after = mode === 'award'
        ? await api.award(id, points, reason.trim(), attempt.current.key)
        : await api.redeem(id, points, reason.trim(), attempt.current.key)
      attempt.current = null
      feel.success()
      afterMemberChange(id)
      setDone({ points, balance: after.member.points })
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
    return (
      <Sheet title={title}>
        <Done
          title={t(mode === 'award' ? 'points.doneAward' : 'points.doneRedeem', { n: number(done.points, language) })}
          lines={[`${detail.data?.member.name ?? ''} · ${t('common.points', { n: number(done.balance, language) })}`]}
        />
        <GoldButton title={t('common.done')} icon="checkmark" onPress={() => router.back()} />
      </Sheet>
    )
  }

  const reasons = mode === 'award' ? AWARD_REASONS : REDEEM_REASONS
  return (
    <Sheet title={title} line={detail.data ? `${detail.data.member.name} · ${t('common.points', { n: number(balance, language) })}` : undefined}>
      <Surface style={{ alignItems: 'center', gap: 14 }}>
        <TextInput
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          placeholder="0"
          placeholderTextColor={C.text3}
          selectionColor={C.gold}
          style={[styles.amount, NO_OUTLINE]}
          accessibilityLabel={t('points.amount')}
          autoFocus
        />
        <Text style={[fonts.label, { color: C.text2 }]}>{t('points.amount')}</Text>
        <View style={styles.quick}>
          {QUICK.map(n => (
            <Press key={n} onPress={() => setAmount(String(n))} style={[styles.chip, points === n && styles.chipOn]}>
              <Text style={[fonts.smallStrong, { color: points === n ? C.onGold : C.text }]}>{mode === 'award' ? '+' : '−'}{n}</Text>
            </Press>
          ))}
        </View>
      </Surface>

      <View style={{ gap: 10 }}>
        <View style={styles.reasons}>
          {reasons.map(key => {
            const words = t(key)
            const on = reason.trim() === words
            return (
              <Press key={key} onPress={() => setReason(words)} style={[styles.reason, on && styles.reasonOn]}>
                <Text style={[fonts.smallStrong, { color: on ? C.gold : C.text2 }]}>{words}</Text>
              </Press>
            )
          })}
        </View>
        <Field label={t('points.reason')} hint={t('points.reasonHint')} value={reason} onChangeText={setReason} maxLength={200} />
      </View>

      {tried && problem && <Notice tone="warning" text={problem === 'points.tooFew' ? t('points.tooFew', { n: number(balance, language) }) : t(problem)} />}
      {failure && <Notice text={t(failure)} />}

      {points > 0 && !problem && (
        <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>{t('points.balanceAfter', { n: number(balanceAfter(mode, points, balance), language) })}</Text>
      )}
      <GoldButton
        title={t(mode === 'award' ? 'points.confirmAward' : 'points.confirmRedeem', { n: number(points, language) })}
        icon={mode === 'award' ? 'add-circle' : 'remove-circle'}
        busy={busy}
        onPress={() => { void send() }}
      />
      <GhostButton title={t('common.cancel')} onPress={() => router.back()} />
    </Sheet>
  )
}

const styles = StyleSheet.create({
  amount: { fontFamily: 'CormorantGaramond_700Bold', fontSize: 64, lineHeight: 72, color: C.goldLight, textAlign: 'center', minWidth: 160 },
  quick: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: RADIUS.pill, backgroundColor: C.surface2, borderWidth: 1, borderColor: C.hairline },
  chipOn: { backgroundColor: C.gold, borderColor: C.gold },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  reason: { flexBasis: '47%', flexGrow: 1, alignItems: 'center', paddingVertical: 11, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairlineStrong },
  reasonOn: { borderColor: C.goldEdge, backgroundColor: C.goldWash },
})
