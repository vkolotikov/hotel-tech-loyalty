import { DetailModal } from '../components/Sheet'
import { useState } from 'react'
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useBoot } from '../lib/queries'
import { useSession } from '../lib/session'
import { usePrefs } from '../lib/prefs'
import { useVersionCheck } from '../lib/appVersion'
import { updateUrl } from '../lib/version'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../lib/i18n'
import { C, ECLIPSE as E, RADIUS, fonts } from '../lib/theme'
import { Avatar, Backdrop, GhostButton, Notice, PageHeading, Row, Surface, ToggleRow, IconBadge } from '../components/ui'

/** Profile: who is signed in, the workspace pages on the web, the language, the lock, request alerts, and signing out. */
export default function Profile() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const boot = useBoot()
  const user = useSession(s => s.user)
  const lock = usePrefs(s => s.lock)
  const alerts = usePrefs(s => s.alerts)
  const alertsState = usePrefs(s => s.alertsState)
  const versionState = useVersionCheck(s => s.state)
  const storeUrl = updateUrl(useVersionCheck(s => s.versions), Platform.OS)
  const [languagesOpen, setLanguagesOpen] = useState(false)
  const [lockBusy, setLockBusy] = useState(false)
  const [lockProblem, setLockProblem] = useState(false)

  const toggleLock = async (on: boolean) => {
    if (lockBusy) return
    setLockBusy(true)
    try {
    setLockProblem(false)
    if (on) {
      const ready = Platform.OS !== 'web' && (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync())
      if (!ready) return setLockProblem(true)
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })
      if (!result.success) return
    }
    await usePrefs.getState().setLock(on)
    } catch { setLockProblem(true) } finally { setLockBusy(false) }
  }

  const signOut = () => {
    const go = async () => {
      await useSession.getState().signOut()
    }
    if (Platform.OS === 'web') return void go()
    Alert.alert(t('more.signOut'), t('more.signOutAsk'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => { void go() } },
    ])
  }

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24, paddingHorizontal: E.inset, gap: E.gap }}>
        <PageHeading title={t('profile.title')} profile={false} />

        <Surface style={styles.me}>
          <Avatar name={boot.data?.staff.name ?? user?.name ?? '·'} size={56} />
          <View style={{ flex: 1, gap: 3 }}>
            
            <Text style={[fonts.heading, { color: C.text }]} >{boot.data?.staff.name ?? user?.name}</Text>
            <Text style={[fonts.small, { color: C.gold }]} >{[boot.data?.organization.name, user?.email].filter(Boolean).join(' · ')}</Text>
          </View>
        </Surface>

        <Row card left={<IconBadge name="globe-outline" color={C.text} />} title={t('more.language')} line={LANGUAGE_NAMES[language]} onPress={() => setLanguagesOpen(true)} />
        <ToggleRow title={t('profile.lock')} line={t('more.lockLine')} icon="lock-closed-outline" value={lock} disabled={lockBusy} onChange={on => { void toggleLock(on) }} />
        {lockProblem && <Notice tone="warning" text={t('more.lockMissing')} />}
        <ToggleRow title={t('more.alerts')} icon="notifications-outline" value={alerts && alertsState !== 'blocked' && alertsState !== 'unavailable'} disabled={alertsState === 'unavailable'} onChange={on => { void usePrefs.getState().setAlerts(on) }} />
        {alertsState === 'blocked' && <Notice tone="warning" text={t('more.alertsBlocked')} action={t('more.alertsSettings')} onAction={() => { void Linking.openSettings() }} />}
        {alertsState === 'unavailable' && <Text style={[fonts.small, { color: C.text3 }]}>{t('more.alertsUnavailable')}</Text>}

        {versionState === 'update_available' && (
          <Notice tone="info" text={t('update.available')} action={storeUrl ? t('update.now') : undefined} onAction={storeUrl ? () => { void Linking.openURL(storeUrl) } : undefined} />
        )}
        <GhostButton title={t('more.signOut')} icon="log-out-outline" tone={C.danger} onPress={signOut} />
        <Text style={[fonts.small, { color: C.text3, textAlign: 'center' }]}>{t('more.version', { v: Constants.expoConfig?.version ?? '1.0.0' })}</Text>
      </ScrollView>
      <DetailModal visible={languagesOpen} onClose={() => setLanguagesOpen(false)} title={t('more.language')}>
        {LANGUAGES.map(code => <Row card key={code} title={LANGUAGE_NAMES[code]} right={code === language ? <Ionicons name="checkmark" size={22} color={C.gold} /> : undefined} onPress={() => { void usePrefs.getState().setLanguage(code); setLanguagesOpen(false) }} />)}
      </DetailModal>
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
