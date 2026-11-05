import { useRef, useState, type ComponentRef, type ReactNode } from 'react'
import { ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View, type Animated } from 'react-native'
import { Redirect } from 'expo-router'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useSession } from '../lib/session'
import { WEB_BASE } from '../lib/api'
import { failureOf } from '../lib/failure'
import { errorKey } from '../lib/desk'
import { LANGUAGES, LANGUAGE_NAMES, useT } from '../lib/i18n'
import { usePrefs } from '../lib/prefs'
import { C, ECLIPSE as E, fonts } from '../lib/theme'
import { Backdrop, Notice, NO_OUTLINE, Press, Row, type IconName } from '../components/ui'
import { Glyph } from '../components/Glyph'
import { BrandMark } from '../components/BrandMark'
import { DetailModal } from '../components/Sheet'
import { ECLIPSE_ASSETS, EclipseSurface, useEclipseBorderLight } from '../components/Eclipse'
import { useEclipseAppearance } from '../lib/useEclipseAppearance'
import type { Key } from '../lib/i18n/en'

/** Existing staff authentication, presented as two independent glass fields. */
export default function SignIn() {
  const appearance = useEclipseAppearance()
  const phase = useEclipseBorderLight(appearance.animate && !appearance.solid)
  const insets = useSafeAreaInsets()
  const { t, language } = useT()
  const token = useSession(s => s.token)
  const passwordField = useRef<ComponentRef<typeof TextInput>>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [languagesOpen, setLanguagesOpen] = useState(false)
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
    } finally { setBusy(false) }
  }

  return <Backdrop>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 20 }]}
        keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          <View style={styles.intro}>
            <BrandMark />
            <View style={styles.heading}>
              <Text accessibilityRole="header" style={styles.title}>{t('signIn.title')}</Text>
              <Text style={styles.subtitle}>{t('signIn.line')}</Text>
            </View>
          </View>
          <View style={styles.form}>
            <LoginField icon="mail-outline" phase={phase} order={0} solid={appearance.solid}>
              <TextInput accessibilityLabel={t('signIn.email')} placeholder={t('signIn.email')} placeholderTextColor={C.text2}
                value={email} onChangeText={setEmail} editable={!busy} autoCapitalize="none" autoCorrect={false}
                autoComplete="email" keyboardType="email-address" textContentType="username" returnKeyType="next" submitBehavior="submit"
                onSubmitEditing={() => passwordField.current?.focus()} selectionColor={C.gold} underlineColorAndroid={C.transparent} style={[styles.input, NO_OUTLINE]} />
            </LoginField>
            <LoginField icon="lock-closed-outline" phase={phase} order={1} solid={appearance.solid}>
              <TextInput ref={passwordField} accessibilityLabel={t('signIn.password')} placeholder={t('signIn.password')} placeholderTextColor={C.text2}
                value={password} onChangeText={setPassword} editable={!busy} secureTextEntry={!revealed} autoCapitalize="none" autoCorrect={false}
                autoComplete="password" textContentType="password" returnKeyType="go" onSubmitEditing={() => { void submit() }}
                selectionColor={C.gold} underlineColorAndroid={C.transparent} style={[styles.input, NO_OUTLINE]} />
              <Press label={t(revealed ? 'signIn.hidePassword' : 'signIn.showPassword')} disabled={busy} onPress={() => setRevealed(v => !v)}>
                <View style={styles.reveal}><Glyph name={revealed ? 'eye-off-outline' : 'eye-outline'} size={23} color={C.text} /></View>
              </Press>
            </LoginField>
            <View style={styles.recovery}>
              <Press label={t('signIn.forgot')} disabled={busy} onPress={() => { void WebBrowser.openBrowserAsync(`${WEB_BASE}/forgot-password`) }}>
                <View style={styles.recoveryLink}><Text style={styles.recoveryText}>{t('signIn.forgot')}</Text></View>
              </Press>
            </View>
            {problem && <Notice text={t(problem)} />}
            <Press label={t('signIn.submit')} disabled={busy} onPress={() => { void submit() }}>
              <EclipseSurface tone="login" radius={30} solid={appearance.solid} borderLight={{ phase, order: 2 }} style={styles.submit}>
                {busy ? <ActivityIndicator color={C.text} accessibilityLabel={t('common.loading')} /> : <Text style={styles.submitText}>{t('signIn.submit')}</Text>}
              </EclipseSurface>
            </Press>
          </View>
          <View style={styles.language}>
            <Press label={`${t('more.language')}: ${LANGUAGE_NAMES[language]}`} disabled={busy} onPress={() => setLanguagesOpen(true)}>
              <View style={styles.languageButton}>
                <Glyph name="globe-outline" size={18} color={C.text2} />
                <Text style={[fonts.smallStrong, { color: C.text2 }]}>{LANGUAGE_NAMES[language]}</Text>
                <Glyph name="chevron-down" size={14} color={C.text2} />
              </View>
            </Press>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    <DetailModal visible={languagesOpen} title={t('more.language')} onClose={() => setLanguagesOpen(false)}>
      {LANGUAGES.map(code => <Row card key={code} title={LANGUAGE_NAMES[code]}
        right={code === language ? <Glyph name="checkmark" color={C.gold} /> : undefined}
        onPress={() => { void usePrefs.getState().setLanguage(code); setLanguagesOpen(false) }} />)}
    </DetailModal>
  </Backdrop>
}

function LoginField({ children, icon, phase, order, solid }: {
  children: ReactNode; icon: IconName; phase: Animated.Value; order: number; solid: boolean
}) {
  return <EclipseSurface radius={22} solid={solid} borderLight={{ phase, order }} style={styles.field}>
    {!solid && <Image source={ECLIPSE_ASSETS.goldRim} pointerEvents="none" accessible={false} style={styles.fieldGlow} />}
    <View style={styles.fieldIcon}><Glyph name={icon} size={23} color={C.text} /></View>
    <View style={styles.separator} />
    {children}
  </EclipseSurface>
}

const styles = StyleSheet.create({
  page: { paddingHorizontal: 28, flexGrow: 1, justifyContent: 'center' },
  content: { width: '100%', maxWidth: 440, alignSelf: 'center', gap: 28 },
  intro: { alignItems: 'center', gap: 22 },
  heading: { alignItems: 'center', gap: 4 },
  title: { ...E.type.loginTitle, color: C.text, textAlign: 'center' },
  subtitle: { ...E.type.loginSubtitle, color: C.text2, textAlign: 'center' },
  form: { gap: 14 },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 58, paddingLeft: 10, paddingRight: 4 },
  fieldGlow: { position: 'absolute', right: -76, bottom: -51, width: 224, height: 74, opacity: 0.48 },
  fieldIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: C.hairline },
  separator: { width: 1, height: 24, marginLeft: 10, marginRight: 8, backgroundColor: C.hairlineStrong },
  input: { ...fonts.body, color: C.text, flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 8, paddingVertical: 12, borderWidth: 0, backgroundColor: C.transparent, includeFontPadding: false, textAlignVertical: 'center' },
  reveal: { width: 44, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  recovery: { alignItems: 'flex-end', marginTop: -8, marginBottom: 8 },
  recoveryLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  recoveryText: { ...fonts.bodyStrong, color: C.gold },
  submit: { minHeight: 58, paddingVertical: 15, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  submitText: { ...fonts.button, fontWeight: '600', color: C.text, textAlign: 'center' },
  language: { alignItems: 'center', marginTop: 4 },
  languageButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
})
