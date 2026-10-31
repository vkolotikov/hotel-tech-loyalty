import { useState } from 'react'
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router } from 'expo-router'
import * as LocalAuthentication from 'expo-local-authentication'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { forgetLook, queryClient, useBoot } from '../../lib/queries'
import { useSession } from '../../lib/session'
import { usePrefs } from '../../lib/prefs'
import { useVersionCheck } from '../../lib/appVersion'
import { updateUrl } from '../../lib/version'
import { number } from '../../lib/format'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../../lib/i18n'
import { C, RADIUS, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { Avatar, Backdrop, GhostButton, IconBadge, Notice, Press, Row, SectionTitle, Surface, Toggle } from '../../components/ui'

/** More: who is signed in at which venue, messages and help, the language, the lock, notifications, and signing out. */
export default function More() {
  const insets = useSafeAreaInsets()
  const { t, tp, language } = useT()
  const boot = useBoot()
  const user = useSession(s => s.user)
  const lock = usePrefs(s => s.lock)
  const alerts = usePrefs(s => s.alerts)
  const alertsState = usePrefs(s => s.alertsState)
  const versionState = useVersionCheck(s => s.state)
  const storeUrl = updateUrl(useVersionCheck(s => s.versions), Platform.OS)
  const [lockProblem, setLockProblem] = useState(false)

  const member = boot.data?.member
  const venue = boot.data?.venue
  const unread = boot.data?.counts.unread_notifications ?? 0

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
      await forgetLook()
    }
    if (Platform.OS === 'web') return void go()
    Alert.alert(t('more.signOut'), t('more.signOutAsk'), [
      { text: tp('portal.common.cancel'), style: 'cancel' },
      { text: t('more.signOut'), style: 'destructive', onPress: () => { void go() } },
    ])
  }

  return (
    <Backdrop>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 20 }}>
        <Text style={[fonts.display, { color: C.text }]}>{t('more.title')}</Text>

        <Surface style={styles.me}>
          <Avatar name={member?.name ?? user?.name ?? '·'} size={56} color={member?.tier?.color_hex} />
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[fonts.heading, { color: C.text }]} numberOfLines={1}>{member?.name ?? user?.name}</Text>
            <Text style={[fonts.small, { color: C.text2 }]} numberOfLines={1}>{member?.user.email ?? user?.email}</Text>
            <Text style={[fonts.smallStrong, { color: C.gold }]} numberOfLines={1}>{[venue?.name, member?.tier?.name].filter(Boolean).join(' · ')}</Text>
          </View>
        </Surface>

        <Surface padding={0} style={{ paddingHorizontal: 16 }}>
          <Row
            left={<IconBadge name="mail-outline" color={C.info} size={36} />}
            title={tp('portal.nav.inbox')}
            line={unread > 0 ? t('home.unread', { n: number(unread, language) }) : t('home.noneUnread')}
            onPress={() => router.push('/inbox')}
          />
          {boot.data && (boot.data.capabilities.services || boot.data.capabilities.stays) && (
            <Row
              left={<IconBadge name="calendar-outline" color={C.gold} size={36} />}
              title={tp('portal.nav.bookings')}
              onPress={() => router.push('/bookings')}
            />
          )}
          {boot.data?.capabilities.events && (
            <Row
              left={<IconBadge name="ticket-outline" color={C.info} size={36} />}
              title={tp('portal.events.title')}
              onPress={() => router.push('/events')}
            />
          )}
          <Row
            left={<IconBadge name="person-circle-outline" color={C.success} size={36} />}
            title={tp('portal.profile.title')}
            line={tp('portal.profile.kinds_title')}
            onPress={() => router.push('/profile')}
          />
          <Row
            left={<IconBadge name="help-buoy-outline" color={C.gold} size={36} />}
            title={tp('portal.help.title')}
            onPress={() => router.push('/help')}
            last
          />
        </Surface>

        <View>
          <SectionTitle title={t('more.preferences')} />
          <Surface style={{ gap: 16 }}>
            <View style={{ gap: 10 }}>
              <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('more.language')}</Text>
              <View style={styles.languages}>
                {LANGUAGES.map(code => (
                  <Press key={code} onPress={() => { void usePrefs.getState().setLanguage(code) }} style={[styles.language, code === language && { borderColor: C.goldEdge, backgroundColor: C.goldWash }]}>
                    <Text style={[fonts.smallStrong, { color: code === language ? C.gold : C.text2 }]}>{LANGUAGE_NAMES[code]}</Text>
                  </Press>
                ))}
              </View>
            </View>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('more.alerts')}</Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{t('more.alertsLine', { venue: venue?.name ?? '' })}</Text>
              </View>
              <Toggle
                value={alerts && alertsState !== 'blocked' && alertsState !== 'unavailable'}
                disabled={alertsState === 'unavailable'}
                onChange={on => { void usePrefs.getState().setAlerts(on) }}
                label={t('more.alerts')}
              />
            </View>
            {alertsState === 'blocked' && <Notice tone="warning" text={t('more.alertsBlocked')} action={t('more.alertsSettings')} onAction={() => { void Linking.openSettings() }} />}
            {alertsState === 'unavailable' && <Text style={[fonts.small, { color: C.text3 }]}>{t('more.alertsUnavailable')}</Text>}
            <View style={styles.switchRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('more.lock')}</Text>
                <Text style={[fonts.small, { color: C.text2 }]}>{t('more.lockLine')}</Text>
              </View>
              <Toggle value={lock} onChange={on => { void toggleLock(on) }} label={t('more.lock')} />
            </View>
            {lockProblem && <Notice tone="warning" text={t('more.lockMissing')} />}
          </Surface>
        </View>

        {versionState === 'update_available' && (
          <Notice tone="info" text={t('update.available')} action={storeUrl ? t('update.now') : undefined} onAction={storeUrl ? () => { void Linking.openURL(storeUrl) } : undefined} />
        )}
        <GhostButton title={t('more.signOut')} icon="log-out-outline" tone={C.danger} onPress={signOut} />
        <View style={styles.footer}>
          <Ionicons name="sparkles-outline" size={12} color={C.text3} />
          <Text style={[fonts.small, { color: C.text3 }]}>{t('brand')} · {t('more.version', { v: Constants.expoConfig?.version ?? '2.0.0' })}</Text>
        </View>
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  me: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  language: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairline },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
})
