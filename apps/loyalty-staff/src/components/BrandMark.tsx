import { Image, StyleSheet, View } from 'react-native'
import { useT } from '../lib/i18n'

/** Original PNG bytes. Layout trims transparent canvas only; all artwork remains visible. */
export function BrandMark() {
  const { t } = useT()
  return <View style={{ width: 280, height: 174, alignSelf: 'center', overflow: 'hidden' }}>
    <Image source={require('../../assets/hexatech-logo-original.png')} accessibilityLabel={t('home.brand')} resizeMode="contain"
      style={[StyleSheet.absoluteFill, { width: 280, height: 280, top: -50 }]} />
  </View>
}
