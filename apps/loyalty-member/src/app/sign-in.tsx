import { useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Redirect, router } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useSession } from '../lib/session'
import { WEB_BASE } from '../lib/api'
import { failureOf } from '../lib/failure'
import { signInErrorKey } from '../lib/errors'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../lib/i18n'
import { usePrefs } from '../lib/prefs'
import { C, RADIUS, fonts } from '../lib/theme'
import { Backdrop, Field, GhostButton, GoldButton, Notice, Press } from '../components/ui'
import type { Key } from '../lib/i18n/en'
import appIcon from '../../assets/icon.png'

/**
 * Sign-in with the membership's email and password (`user_type: member`, so a staff account is never let in here).
 * New members join with their venue's sign-up link or QR; members imported by a venue set up their account on the web.
 */
export default function SignIn() {
  const insets = useSafeAreaInsets()
  const { t, tp, language } = useT()
  const token = useSession(s => s.token)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Key | null>(null)

  if (token && !busy) return <Redirect href="/" />

  const submit = async () => {
    if (!email.trim() || !password) return setProblem('error.invalid')
    setBusy(true)
    setProblem(null)
    try {
      await useSession.getState().signIn(email, password)
    } catch (error) {
      setProblem(signInErrorKey(failureOf(error)))
    }
    setBusy(false)
  }

  return (
    <Backdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 44, paddingBottom: insets.bottom + 28 }]} keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <Image source={appIcon} style={[styles.mark, { borderColor: C.goldEdge }]} accessibilityIgnoresInvertColors />
            <Text style={[fonts.label, { color: C.gold }]}>{t('brand')}</Text>
            <Text style={[fonts.display, { color: C.text, textAlign: 'center' }]}>{t('signIn.title')}</Text>
            <Text style={[fonts.body, { color: C.text2, textAlign: 'center' }]}>{t('signIn.line')}</Text>
          </View>

          <View style={styles.form}>
            <Field label={t('signIn.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" />
            <Field label={t('signIn.password')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => { void submit() }} />
            {problem && <Notice text={t(problem)} />}
            <GoldButton title={t('signIn.submit')} icon="arrow-forward" busy={busy} onPress={() => { void submit() }} />
            <Press onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/forgot-password`) }} style={{ alignSelf: 'center', padding: 6 }}>
              <Text style={[fonts.smallStrong, { color: C.gold }]}>{t('signIn.forgot')}</Text>
            </Press>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={[fonts.label, { color: C.text3, textAlign: 'center' }]}>{t('signIn.new')}</Text>
            <GhostButton title={t('signIn.join')} icon="qr-code-outline" onPress={() => router.push('/join')} />
            <Text style={[fonts.small, { color: C.text3, textAlign: 'center', marginTop: 6 }]}>{tp('portal.join.existing')}</Text>
            <Press onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/portal/claim`) }} style={styles.claim}>
              <Ionicons name="person-add-outline" size={15} color={C.gold} />
              <Text style={[fonts.smallStrong, { color: C.gold }]}>{t('signIn.claim')}</Text>
            </Press>
          </View>

          <View style={styles.languages}>
            {LANGUAGES.map(code => (
              <Press key={code} onPress={() => { void usePrefs.getState().setLanguage(code) }} style={[styles.language, code === language && { borderColor: C.goldEdge, backgroundColor: C.goldWash }]}>
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
  page: { paddingHorizontal: 24, gap: 30, flexGrow: 1 },
  brand: { alignItems: 'center', gap: 12 },
  mark: { width: 76, height: 76, borderRadius: 20, borderWidth: 1, marginBottom: 6 },
  form: { gap: 18, backgroundColor: 'rgba(16,20,29,0.7)', borderRadius: RADIUS.xl, padding: 20, borderWidth: 1, borderColor: C.hairline },
  claim: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 8 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 'auto' },
  language: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairline },
})
