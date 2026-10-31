import { useState } from 'react'
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import * as LocalAuthentication from 'expo-local-authentication'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { WEB_BASE } from '../../lib/api'
import { queryClient, useBoot } from '../../lib/queries'
import { useSession } from '../../lib/session'
import { usePrefs } from '../../lib/prefs'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../../lib/i18n'
import type { Key } from '../../lib/i18n/en'
import { C, RADIUS, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { Avatar, Backdrop, GhostButton, IconBadge, Notice, Press, Row, SectionTitle, Surface, type IconName } from '../../components/ui'

/** The workspace pages a phone opens in the browser (the web workspace's own routes). */
const WEB_PAGES: { path: string; label: Key; icon: IconName; color: string }[] = [
  { path: 'program', label: 'more.program', icon: 'trophy-outline', color: C.gold },
  { path: 'rewards', label: 'more.rewards', icon: 'gift-outline', color: '#c58cff' },
  { path: 'events', label: 'more.events', icon: 'calendar-outline', color: C.info },
  { path: 'campaigns', label: 'more.campaigns', icon: 'megaphone-outline', color: '#ff7eb6' },
  { path: 'insights', label: 'more.insights', icon: 'stats-chart-outline', color: C.success },
  { path: 'settings', label: 'more.settings', icon: 'settings-outline', color: C.text2 },
  { path: 'guide', label: 'more.guide', icon: 'book-outline', color: C.goldLight },
]

/** More: who is signed in, the workspace pages on the web, the language, the lock, and signing out. */
export default function More() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const boot = useBoot()
  const user = useSession(s => s.user)
  const lock = usePrefs(s => s.lock)
  const [lockProblem, setLockProblem] = useState(false)

  const toggleLock = async (on: boolean) => {
    setLockProblem(false)
    if (on) {
      const ready = Platform.OS !== 'web' && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
      if (!ready) return setLockProblem(true)
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (!result.success) return
    }
    await usePrefs.getState().setLock(on)
  }

  const signOut = () => {
    const go = async () => {
      await useSession.getState().signOut()
      queryClient.clear()
    }
    if (Platform.OS === 'web') return void go()
    Alert.alert(t('more.signOut'), t('more.signOutAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => { void go() } },
    ])
  }

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 20 }}>
        <Text style={[fonts.display, { color: C.text }]}>{t('more.title')}</Text>

        <Surface style={styles.me}>
          <Avatar name={boot.data?.staff.name ?? user?.name ?? '·'} size={56} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[fonts.label, { color: C.text2 }]}>{t('more.signedInAs')}</Text>
            <Text style={[fonts.heading, { color: C.text }]} numberOfLines={1}>{boot.data?.staff.name ?? user?.name}</Text>
            <Text style={[fonts.small, { color: C.gold }]} numberOfLines={1}>{[boot.data?.organization.name, user?.email].filter(Boolean).join(' · ')}</Text>
          </View>
        </Surface>

        <View>
          <SectionTitle title={t('more.web')} />
          <Surface padding={0} style={{ paddingHorizontal: 16 }}>
            {WEB_PAGES.map((page, i) => (
              <Row
                key={page.path}
                left={<IconBadge name={page.icon} color={page.color} size={36} />}
                title={t(page.label)}
                right={<Ionicons name="open-outline" size={16} color={C.text3} />}
                onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/loyalty/${page.path}`) }}
                last={i === WEB_PAGES.length - 1}
              />
            ))}
          </Surface>
          <Text style={[fonts.small, { color: C.text3, marginTop: 8 }]}>{t('more.webLine')}</Text>
        </View>

        <View>
          <SectionTitle title={t('more.preferences')} />
          <Surface style={{ gap: 16 }}>
            <View style={{ gap: 10 }}>
              <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('more.language')}</Text>
              <View style={styles.languages}>
                {LANGUAGES.map(code => (
                  <Press key={code} onPress={() => { void usePrefs.getState().setLanguage(code) }} style={[styles.language, code === language && styles.languageOn]}>
                    <Text style={[fonts.smallStrong, { color: code === language ? C.gold : C.text2 }]}>{LANGUAGE_NAMES[code]}</Text>
                  </Press>
                ))}
              </View>
            </View>
            <View style={styles.lockRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('more.lock')}</Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{t('more.lockLine')}</Text>
              </View>
              <Switch value={lock} onValueChange={on => { void toggleLock(on) }} trackColor={{ true: C.gold, false: C.surface3 }} thumbColor="#fff" />
            </View>
            {lockProblem && <Notice tone="warning" text={t('more.lockMissing')} />}
          </Surface>
        </View>

        <GhostButton title={t('more.signOut')} icon="log-out-outline" tone={C.danger} onPress={signOut} />
        <Text style={[fonts.small, { color: C.text3, textAlign: 'center' }]}>{t('more.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}</Text>
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  language: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairline },
  languageOn: { borderColor: C.goldEdge, backgroundColor: C.goldWash },
  lockRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
})
