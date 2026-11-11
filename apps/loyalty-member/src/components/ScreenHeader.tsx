import { Image, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import { C, fonts } from '../lib/theme'
import { useBoot } from '../lib/queries'
import { useT } from '../lib/i18n'
import { MemberIcon } from './MemberIcon'
import { Picture, Press } from './ui'

export function ScreenHeader({ title, back = false, inbox = true }: { title: string; back?: boolean; inbox?: boolean }) {
  const { tp } = useT()
  const boot = useBoot()
  const unread = boot.data?.counts.unread_notifications ?? 0
  return <View style={styles.header}>
    {back ? <Press label={tp('portal.common.back')} onPress={() => router.back()}><View style={styles.button}><MemberIcon name="back" /></View></Press> : <Picture url={boot.data?.venue.logo_url} style={styles.mark} fallback={<Image source={require('../../assets/icon.png')} style={styles.mark} accessible={false} />} />}
    <Text accessibilityRole="header" style={[fonts.heading, { color: C.text, flex: 1 }]}>{title}</Text>
    {inbox && <Press label={tp('portal.nav.inbox')} onPress={() => router.push('/inbox')}><View style={[styles.button, { backgroundColor: C.surface }]}><MemberIcon name="bell" size={22} />{unread > 0 && <View style={[styles.dot, { backgroundColor: C.gold }]} />}</View></Press>}
  </View>
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', gap: 12, minHeight: 44, alignItems: 'center' },
  mark: { width: 32, height: 32, borderRadius: 9 },
  button: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', width: 7, height: 7, borderRadius: 4, top: 7, right: 8 },
})
