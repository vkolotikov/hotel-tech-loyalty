import { Glyph } from '../components/Glyph'
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Redirect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../lib/session'
import { WEB_BASE } from '../lib/api'
import { failureOf } from '../lib/failure'
import { errorKey } from '../lib/desk'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../lib/i18n'
import { usePrefs } from '../lib/prefs'
import { C, RADIUS, fonts } from '../lib/theme'
import { Backdrop, Field, GoldButton, Notice, NO_OUTLINE, Press } from '../components/ui'
import { BrandMark } from '../components/BrandMark'
import { EclipseSurface, useEclipseBorderLight } from '../components/Eclipse'
import { useEclipseAppearance } from '../lib/useEclipseAppearance'
import type { Key } from '../lib/i18n/en'

/**
 * Sign-in: the staff account the web workspace uses. Only staff accounts are asked for (`user_type: staff`); after the
 * token, the loyalty bootstrap must answer, so an account without HexaTech Loyalty is told so here, not on an empty home.
 */
export default function SignIn() {
  const appearance = useEclipseAppearance()
  const borderPhase = useEclipseBorderLight(appearance.animate && !appearance.solid)
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const token = useSession(s => s.token)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Key | null>(null)

  if (token && !busy) return <Redirect href="/" />

  const submit = async () => {
    if (busy) return
    if (!email.trim() || !password) return setProblem('signIn.fill')
    setBusy(true)
    setProblem(null)
    try {
      await useSession.getState().signIn(email, password)
    } catch (error) {
      const failure = failureOf(error)
      setProblem(failure.code === 'invalid' || failure.status === 422 ? 'signIn.wrong' : failure.status === 403 || failure.status === 402 ? (failure.code === 'workspace_disabled' || failure.code === 'not_in_plan' ? errorKey(failure.code) : 'signIn.noAccess') : errorKey(failure.code))
      setBusy(false)
      return
    }
    setBusy(false)
  }

  return (
    <Backdrop>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
          <BrandMark size={104} />
          <Text accessibilityRole="header" style={[fonts.display, { color: C.text }]}>{t('signIn.submit')}</Text>

          <EclipseSurface radius={28} solid={appearance.solid} borderLight={{ phase: borderPhase, order: 0 }} style={styles.form}>
            <Field label={t('signIn.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" />
            <View style={{ gap: 8 }}><Text style={[fonts.label, { color: C.text2 }]}>{t('signIn.password')}</Text>
              <View style={styles.password}>
                <TextInput accessibilityLabel={t('signIn.password')} value={password} onChangeText={setPassword} secureTextEntry={!revealed} autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => { void submit() }} style={[fonts.body, NO_OUTLINE, { color: C.text, flex: 1, minHeight: 56, paddingHorizontal: 16, borderWidth: 0, backgroundColor: C.transparent }]} />
                <Press label={t(revealed ? 'signIn.hidePassword' : 'signIn.showPassword')} onPress={() => setRevealed(v => !v)}><View style={{ width: 48, height: 56, alignItems: 'center', justifyContent: 'center' }}><Glyph name={revealed ? 'eye-off-outline' : 'eye'} size={22} color={C.text2} /></View></Press>
              </View>
            </View>
            {problem && <Notice text={t(problem)} />}
            <GoldButton title={t('signIn.submit')} icon="arrow-forward" busy={busy} onPress={() => { void submit() }} borderLight={{ phase: borderPhase, order: 2 }} />
            <Press onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/forgot-password`) }} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={[fonts.smallStrong, { color: C.gold }]}>{t('signIn.forgot')}</Text>
            </Press>
          </EclipseSurface>

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
  page: { paddingHorizontal: 24, gap: 24, flexGrow: 1 },
  password: { flexDirection: 'row', alignItems: 'center', borderRadius: 18, borderWidth: 1, borderColor: C.hairlineStrong, backgroundColor: C.surface },
  form: { gap: 18, padding: 20 },
  languages: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 'auto' },
  language: { paddingHorizontal: 12, paddingVertical: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.hairline },
  languageOn: { borderColor: C.goldEdge, backgroundColor: C.goldWash },
})
