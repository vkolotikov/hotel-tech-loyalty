import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Redirect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../lib/session'
import { api, WEB_BASE } from '../lib/api'
import { failureOf } from '../lib/failure'
import { errorKey } from '../lib/desk'
import { queryClient, KEYS } from '../lib/queries'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../lib/i18n'
import { usePrefs } from '../lib/prefs'
import { C, RADIUS, fonts } from '../lib/theme'
import { Backdrop, Field, GoldButton, Notice, Press } from '../components/ui'
import type { Key } from '../lib/i18n/en'
import appIcon from '../../assets/icon.png'

/**
 * Sign-in: the staff account the web workspace uses. Only staff accounts are asked for (`user_type: staff`); after the
 * token, the loyalty bootstrap must answer, so an account without HexaTech Loyalty is told so here, not on an empty home.
 */
export default function SignIn() {
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const token = useSession(s => s.token)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Key | null>(null)

  if (token && !busy) return <Redirect href="/" />

  const submit = async () => {
    if (!email.trim() || !password) return setProblem('signIn.fill')
    setBusy(true)
    setProblem(null)
    try {
      await useSession.getState().signIn(email, password)
    } catch (error) {
      const failure = failureOf(error)
      setProblem(failure.code === 'invalid' || failure.status === 422 ? 'signIn.wrong' : errorKey(failure.code))
      setBusy(false)
      return
    }
    try {
      queryClient.setQueryData(KEYS.boot, await api.bootstrap())
      setBusy(false)
    } catch (error) {
      const failure = failureOf(error)
      await useSession.getState().signOut()
      setProblem(failure.status === 403 || failure.status === 402 ? (failure.code === 'workspace_disabled' || failure.code === 'not_in_plan' ? errorKey(failure.code) : 'signIn.noAccess') : errorKey(failure.code))
      setBusy(false)
    }
  }

  return (
    <Backdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={appIcon} style={styles.mark} accessibilityIgnoresInvertColors />
            <Text style={[fonts.label, { color: C.gold }]}>{t('signIn.eyebrow')}</Text>
            <Text style={[fonts.display, { color: C.text, textAlign: 'center' }]}>{t('signIn.title')}</Text>
            <Text style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{t('signIn.line')}</Text>
          </View>

          <View style={styles.form}>
            <Field label={t('signIn.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" />
            <Field label={t('signIn.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => { void submit() }} />
            {problem && <Notice text={t(problem)} />}
            <GoldButton title={t('signIn.submit')} icon="arrow-forward" busy={busy} onPress={() => { void submit() }} />
            <Press onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/forgot-password`) }} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={[fonts.smallStrong, { color: C.gold }]}>{t('signIn.forgot')}</Text>
            </Press>
          </View>

          <View style={styles.languages}>
            {LANGUAGES.map(code => (
              <Press key={code} onPress={() => { void usePrefs.getState().setLanguage(code) }} style={[styles.language, code === language && styles.languageOn]}>
                <Text style={[fonts.smallStrong, { color: code === language ? C.gold : C.text2 }]}>{LANGUAGE_NAMES[code]}</Text>
              </Press>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 24, gap: 36, flexGrow: 1 },
  brand: { alignItems: 'center', gap: 12 },
  mark: { width: 76, height: 76, borderRadius: 20, borderWidth: 1, borderColor: C.goldEdge, marginBottom: 8 },
  form: { gap: 18, backgroundColor: 'rgba(16,20,29,0.7)', borderRadius: RADIUS.xl, padding: 20, borderWidth: 1, borderColor: C.hairline },
  languages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 'auto' },
  language: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairline },
  languageOn: { borderColor: C.goldEdge, backgroundColor: C.goldWash },
})
