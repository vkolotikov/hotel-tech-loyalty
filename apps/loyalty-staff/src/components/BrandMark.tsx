import { Image, View } from 'react-native'
import { useT } from '../lib/i18n'

/** The supplied emblem, with its adaptive-icon safe padding removed by layout only. */
export function BrandMark({ size = 72 }: { size?: number }) {
  const { t } = useT()
  return <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    <Image source={require('../../assets/brand-emblem.png')} accessibilityLabel={t('home.brand')} resizeMode="contain" style={{ width: size * 1.45, height: size * 1.45 }} />
  </View>
}
