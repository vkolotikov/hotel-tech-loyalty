import { StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { C, fonts } from '../lib/theme'
import { useT } from '../lib/i18n'
import type { BenefitBadge } from '../lib/types'

/** A tier's benefits: each with its wording ("Until 2 pm"), or its typed value when it has no wording. */
export function BenefitList({ benefits }: { benefits: BenefitBadge[] }) {
  const { t } = useT()
  if (benefits.length === 0) return <Text style={[fonts.body, { color: C.text2 }]}>{t('result.noBenefits')}</Text>
  return (
    <View style={{ gap: 10 }}>
      {benefits.map((benefit, i) => (
        <View key={`${benefit.name}-${i}`} style={styles.item}>
          <View style={styles.mark}><Ionicons name="ribbon" size={16} color={C.gold} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[fonts.bodyStrong, { color: C.text }]}>{benefit.name}</Text>
            {valueOf(benefit) ? <Text style={[fonts.small, { color: C.text2 }]}>{valueOf(benefit)}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  )
}

/** The benefit's own words, else its typed value as the web shows it (15% off, ×2 points). */
function valueOf(benefit: BenefitBadge): string | null {
  if (benefit.value) return benefit.value
  if (benefit.value_amount === null || benefit.value_amount === undefined) return null
  if (benefit.value_type === 'percent_discount') return `${benefit.value_amount}%`
  if (benefit.value_type === 'points_multiplier') return `×${benefit.value_amount}`
  return String(benefit.value_amount)
}

const styles = StyleSheet.create({
  item: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mark: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: C.goldWash },
})
