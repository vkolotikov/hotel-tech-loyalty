import { useState } from 'react'
import { Linking, Platform, Text, View } from 'react-native'
import * as LocalAuthentication from 'expo-local-authentication'
import { useBoot } from '../lib/queries'
import { usePrefs } from '../lib/prefs'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../lib/i18n'
import { C, fonts } from '../lib/theme'
import { Sheet } from '../components/Sheet'
import { ActionPopup } from '../components/ActionPopup'
import { MemberIcon } from '../components/MemberIcon'
import { Notice, Press, Row, Surface, Toggle } from '../components/ui'
import { Messages } from '../components/MessagePreferences'

export default function Preferences() {
  const { t, language } = useT()
  const boot = useBoot()
  const lock = usePrefs(s => s.lock)
  const alerts = usePrefs(s => s.alerts)
  const alertsState = usePrefs(s => s.alertsState)
  const [languages, setLanguages] = useState(false)
  const [lockProblem, setLockProblem] = useState(false)
  const [lockBusy, setLockBusy] = useState(false)
  const toggleLock = async (on: boolean) => {
    if (lockBusy) return
    setLockBusy(true); setLockProblem(false)
    try {
      if (on) {
        const ready = Platform.OS !== 'web' && await LocalAuthentication.hasHardwareAsync() && await LocalAuthentication.isEnrolledAsync()
        if (!ready) { setLockProblem(true); return }
        if (!(await LocalAuthentication.authenticateAsync({ promptMessage: t('lock.prompt') })).success) return
      }
      await usePrefs.getState().setLock(on)
    } catch { setLockProblem(true) }
    finally { setLockBusy(false) }
  }
  return <Sheet title={t('more.preferences')}>
    <Surface padding={0} style={{ paddingHorizontal: 16 }}><Row title={t('more.language')} line={LANGUAGE_NAMES[language]} left={<MemberIcon name="globe" />} onPress={() => setLanguages(true)} last /></Surface>
    <Surface style={{ gap: 16 }}>
      <Setting title={t('more.lock')} hint={t('more.lockLine')}><Toggle value={lock} disabled={lockBusy} onChange={on => { void toggleLock(on) }} label={t('more.lock')} /></Setting>
      {lockProblem && <Notice tone="warning" text={t('more.lockMissing')} />}
      <Setting title={t('more.alerts')} hint={t('more.alertsLine', { venue: boot.data?.venue.name ?? '' })}><Toggle value={alerts} onChange={on => { void usePrefs.getState().setAlerts(on) }} label={t('more.alerts')} /></Setting>
      {alertsState === 'blocked' && <Notice tone="warning" text={t('more.alertsBlocked')} action={t('more.alertsSettings')} onAction={() => { void Linking.openSettings() }} />}
      {alertsState === 'unavailable' && <Text style={[fonts.small, { color: C.text3 }]}>{t('more.alertsUnavailable')}</Text>}
    </Surface>
    <Messages />
    <ActionPopup visible={languages} title={t('more.language')} onClose={() => setLanguages(false)}>
      {LANGUAGES.map(code => <Press key={code} label={LANGUAGE_NAMES[code]} onPress={() => { void usePrefs.getState().setLanguage(code); setLanguages(false) }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 }}><Text style={[fonts.bodyStrong, { color: code === language ? C.gold : C.text, flex: 1 }]}>{LANGUAGE_NAMES[code]}</Text>{code === language && <MemberIcon name="check" color={C.gold} />}</View></Press>)}
    </ActionPopup>
  </Sheet>
}
function Setting({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={{ flex: 1, gap: 3 }}><Text style={[fonts.bodyStrong, { color: C.text }]}>{title}</Text><Text style={[fonts.small, { color: C.text2 }]}>{hint}</Text></View>{children}</View>
}
