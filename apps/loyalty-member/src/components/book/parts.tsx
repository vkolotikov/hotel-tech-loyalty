import type { ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useT } from '../../lib/i18n'
import { C, RADIUS, fonts } from '../../lib/theme'
import { formatMoney, vocabKey, type Quote } from '../../shared/portal'
import { Notice, Press } from '../ui'

/**
 * Where the member is in a booking flow: the steps by name, the earlier ones pressable to go back, none of them while
 * a card is held against a booking not yet confirmed (`locked`, the portal's `canLeavePay`).
 */
export function StepStrip<S extends string>({ steps, current, labels, locked, onJump }: { steps: S[]; current: S; labels: Record<S, string>; locked: boolean; onJump: (step: S) => void }) {
  const at = steps.indexOf(current)
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
      {steps.map((step, i) => {
        const done = i < at
        const here = i === at
        const dot = (
          <View style={styles.step} accessibilityLabel={labels[step]}>
            <View style={[styles.dot, { borderColor: here || done ? C.gold : C.hairlineStrong, backgroundColor: done ? C.gold : here ? C.goldWash : 'transparent' }]}>
              {done ? <Ionicons name="checkmark" size={12} color={C.onGold} /> : <Text style={[fonts.smallStrong, { fontSize: 11, color: here ? C.gold : C.text3 }]}>{i + 1}</Text>}
            </View>
            {here && <Text style={[fonts.smallStrong, { color: C.text }]}>{labels[step]}</Text>}
          </View>
        )
        return (
          <View key={step} style={styles.stepWrap}>
            {i > 0 && <View style={[styles.bar, { backgroundColor: i <= at ? C.goldEdge : C.hairline }]} />}
            {done && !locked ? <Press onPress={() => onJump(step)} label={labels[step]} haptic={false}>{dot}</Press> : <View style={done && locked ? { opacity: 0.5 } : undefined}>{dot}</View>}
          </View>
        )
      })}
    </ScrollView>
  )
}

/** A choice that shows whether it is picked (a person, a day, a time, a coupon). */
export function Choice({ children, picked, onPress, disabled, label, style, compact }: { children: ReactNode; picked: boolean; onPress: () => void; disabled?: boolean; label?: string; style?: object; compact?: boolean }) {
  return (
    <Press onPress={onPress} disabled={disabled} label={label} style={style}>
      <View
        style={[
          styles.choice,
          { borderColor: picked ? C.gold : C.hairlineStrong, backgroundColor: picked ? C.gold : C.surface },
          disabled && { opacity: 0.35 },
          compact && { paddingHorizontal: 2, minHeight: 58 },
        ]}
        accessibilityState={{ selected: picked, disabled }}
      >
        {children}
      </View>
    </Press>
  )
}

/** How many people: fewer and more around the number, as the portal's Stepper. */
export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const { tp } = useT()
  return (
    <View style={styles.stepper}>
      <Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{label}</Text>
      <Press onPress={() => onChange(Math.max(min, value - 1))} disabled={value <= min} label={tp('portal.book.fewer')}>
        <View style={[styles.round, value <= min && { opacity: 0.35 }]}><Ionicons name="remove" size={18} color={C.text} /></View>
      </Press>
      <Text style={[fonts.number, { color: C.text, minWidth: 28, textAlign: 'center' }]}>{value}</Text>
      <Press onPress={() => onChange(Math.min(max, value + 1))} disabled={value >= max} label={tp('portal.book.more')}>
        <View style={[styles.round, value >= max && { opacity: 0.35 }]}><Ionicons name="add" size={18} color={C.text} /></View>
      </Press>
    </View>
  )
}

/** Every number comes straight from the server's quote; nothing is computed here (the portal's PriceBreakdown). */
export function PriceBreakdown({ quote: q, industry }: { quote: Quote; industry: string | null | undefined }) {
  const { tp, language } = useT()
  const money = (amount: number) => formatMoney(amount, q.currency, language)
  return (
    <View style={{ gap: 8 }}>
      <Line label={q.service.name} value={money(q.lines.service_price)} />
      {q.lines.extras.map(l => <Line key={l.id} label={`${l.name}${l.quantity > 1 ? ` × ${l.quantity}` : ''}`} value={money(l.line_total)} />)}
      <View style={styles.rule} />
      <Line label={tp('portal.book.subtotal')} value={money(q.list_amount)} />
      {q.discount && <Line label={q.discount.label} value={`−${money(q.discount.amount)}`} tone={C.success} />}
      <View style={styles.rule} />
      <Line label={tp('portal.book.total')} value={money(q.total_amount)} strong />
      {q.coupon?.status === 'outbid' && <Notice tone="info" text={tp('portal.book.coupon_outbid', { label: q.coupon.label })} />}
      {q.coupon?.status === 'wrong_scope' && <Notice tone="warning" text={tp('portal.book.coupon_wrong_scope', { label: q.coupon.label, noun: tp(vocabKey(industry, 'booking_plural')) })} />}
    </View>
  )
}

export function Line({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <View style={styles.line}>
      <Text style={[strong ? fonts.bodyStrong : fonts.body, { color: C.text, flex: 1 }, strong && { fontSize: 18 }]}>{label}</Text>
      <Text style={[strong ? fonts.bodyStrong : fonts.body, { color: tone ?? C.text, fontVariant: ['tabular-nums'] }, strong && { fontSize: 18 }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  strip: { alignItems: 'center', paddingVertical: 2 },
  stepWrap: { flexDirection: 'row', alignItems: 'center' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bar: { width: 22, height: 1.5, marginHorizontal: 6 },
  choice: { minHeight: 48, borderRadius: RADIUS.md, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.hairlineStrong, alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  line: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  rule: { height: 1, backgroundColor: C.hairline },
})
