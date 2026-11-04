import { Image, StyleSheet, View } from 'react-native'
import { useT } from '../lib/i18n'

/** Full supplied brand lockup, used only on the sign-in screen. */
export function BrandMark() {
  const { t } = useT()
  return <View style={{ width: '100%', maxWidth: 300, aspectRatio: 1.5, alignSelf: 'center' }}>
    <Image source={require('../../assets/login-logo.png')} accessibilityLabel={t('home.brand')} resizeMode="contain"
      style={[StyleSheet.absoluteFill, { width: '100%', height: '100%' }]} />
  </View>
}
