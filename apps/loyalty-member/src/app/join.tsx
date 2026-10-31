import { useEffect, useRef, useState } from 'react'
import { Image, Platform, StyleSheet, Text, View } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../lib/api'
import { failureOf } from '../lib/failure'
import { errorKey } from '../lib/errors'
import { joinTokenFrom } from '../lib/format'
import { feel } from '../lib/haptics'
import { useSession } from '../lib/session'
import { useT } from '../lib/i18n'
import { C, RADIUS, fonts } from '../lib/theme'
import { counted } from '../shared/portal'
import { Field, GhostButton, GoldButton, Notice, Shimmer, Surface } from '../components/ui'
import { Sheet } from '../components/Sheet'

/**
 * Joining a venue's membership: its sign-up QR code or link names the programme (`?org=<token>`, as the portal's
 * `/portal/join`), then the portal's own form — name, email, phone, password, a friend's code — makes the account and
 * signs the member in. The words are the portal's; a sign-up the venue does not take says the venue's reason.
 */
export default function Join() {
  const params = useLocalSearchParams<{ org?: string; ref?: string }>()
  const org = typeof params.org === 'string' ? params.org : ''
  const ref = typeof params.ref === 'string' ? params.ref : ''
  const { t } = useT()

  return (
    <Sheet title={t('join.title')}>
      {org ? <JoinForm org={org} refCode={ref} /> : <FindProgramme />}
    </Sheet>
  )
}

/** No programme yet: scan the venue's QR code, or paste the link it sent. */
function FindProgramme() {
  const { t } = useT()
  const [scanning, setScanning] = useState(false)
  const [link, setLink] = useState('')
  const [problem, setProblem] = useState(false)
  const [permission, askPermission] = useCameraPermissions()
  const handled = useRef(false)

  const use = (text: string) => {
    const found = joinTokenFrom(text)
    if (!found) {
      setProblem(true)
      feel.warning()
      return false
    }
    feel.success()
    router.setParams({ org: found.org, ref: found.ref ?? '' })
    return true
  }

  return (
    <View style={{ gap: 18 }}>
      <Text style={[fonts.body, { color: C.text2 }]}>{t('join.line')}</Text>

      {Platform.OS !== 'web' && (
        scanning && permission?.granted ? (
          <View style={styles.cameraWrap}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={result => {
                if (handled.current) return
                handled.current = true
                if (!use(result.data)) setTimeout(() => { handled.current = false }, 1500)
              }}
            />
            <View style={[styles.frame, { borderColor: C.gold }]} pointerEvents="none" />
            <Text style={[fonts.smallStrong, styles.cameraHint]}>{t('join.pointCamera')}</Text>
          </View>
        ) : permission && !permission.granted && !permission.canAskAgain ? (
          <Notice tone="warning" text={t('join.cameraDenied')} />
        ) : (
          <GoldButton
            title={t('join.scan')}
            icon="qr-code-outline"
            onPress={() => {
              void (async () => {
                const answer = permission?.granted ? permission : await askPermission()
                if (answer.granted) setScanning(true)
              })()
            }}
          />
        )
      )}

      <Surface style={{ gap: 12 }}>
        <Field label={t('join.paste')} value={link} onChangeText={value => { setLink(value); setProblem(false) }} autoCapitalize="none" autoCorrect={false} placeholder="https://…/portal/join?org=…" />
        {problem && <Notice tone="warning" text={t('join.badLink')} />}
        <GhostButton title={t('join.continue')} icon="arrow-forward" disabled={link.trim() === ''} onPress={() => { use(link) }} />
      </Surface>
    </View>
  )
}

/** The programme is known: its name, its welcome bonus and the portal's sign-up form. */
function JoinForm({ org, refCode }: { org: string; refCode: string }) {
  const { t, tp, language } = useT()
  const context = useQuery({ queryKey: ['join', org], queryFn: () => api.joinContext(org), retry: false })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [referral, setReferral] = useState(refCode)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  useEffect(() => setReferral(refCode), [refCode])

  if (context.isLoading) return <View style={{ gap: 12 }}><Shimmer height={90} /><Shimmer height={260} /></View>
  const ctx = context.data
  if (context.isError || !ctx?.accepting_joins) {
    const reason = ctx?.error ?? failureOf(context.error).message
    return (
      <View style={{ gap: 14 }}>
        <Text style={[fonts.title, { color: C.text }]}>{tp('portal.join.closed_title')}</Text>
        <Notice tone="warning" text={reason ?? tp('portal.join.closed_body')} />
        <GhostButton title={t('join.paste')} icon="refresh" onPress={() => router.setParams({ org: '', ref: '' })} />
      </View>
    )
  }

  const submit = async () => {
    setProblem(null)
    if (password !== confirm) return setProblem(tp('portal.profile.password_mismatch'))
    setBusy(true)
    try {
      const answer = await api.register({ name: name.trim(), email: email.trim().toLowerCase(), phone: phone.trim(), password, password_confirmation: password, referral_code: referral.trim(), org_token: org })
      await useSession.getState().adopt(answer)
      feel.success()
      router.replace('/')
    } catch (error) {
      const failure = failureOf(error)
      setProblem(failure.status === 422 && failure.message ? failure.message : failure.code === 'network' ? t(errorKey(failure)) : (failure.message ?? tp('portal.join.failed')))
      feel.warning()
    }
    setBusy(false)
  }

  const bonus = ctx.welcome_bonus ? counted(tp, 'join.with_bonus', ctx.welcome_bonus, language) : tp('portal.join.no_bonus')

  return (
    <View style={{ gap: 18 }}>
      <View style={styles.venue}>
        {ctx.theme?.logo_url
          ? <Image source={{ uri: ctx.theme.logo_url }} style={[styles.logo, { borderColor: C.goldEdge }]} />
          : <View style={[styles.logo, styles.logoMark, { backgroundColor: C.goldWash, borderColor: C.goldEdge }]}><Ionicons name="sparkles" size={22} color={C.gold} /></View>}
        <Text style={[fonts.title, { color: C.text, textAlign: 'center' }]}>{tp('portal.join.title', { venue: ctx.organization.name })}</Text>
        <Text style={[fonts.body, { color: C.goldLight, textAlign: 'center' }]}>{bonus}</Text>
      </View>

      {problem && <Notice text={problem} />}

      <Surface style={{ gap: 14 }}>
        <Field label={tp('portal.join.name')} value={name} onChangeText={setName} autoComplete="name" textContentType="name" />
        <Field label={tp('portal.join.email')} value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
        <Field label={tp('portal.join.phone')} value={phone} onChangeText={setPhone} autoComplete="tel" keyboardType="phone-pad" textContentType="telephoneNumber" />
        <Field label={tp('portal.join.password')} hint={tp('portal.profile.password_hint')} value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        <Field label={tp('portal.join.password_confirm')} value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" textContentType="newPassword" />
        {ctx.referrals !== false && (
          <Field
            label={tp('portal.join.referral')}
            hint={refCode ? tp('portal.join.referral_prefilled') : tp('portal.join.referral_hint')}
            value={referral}
            onChangeText={setReferral}
            autoCapitalize="characters"
            autoCorrect={false}
          />
        )}
      </Surface>

      <GoldButton
        title={tp('portal.join.submit')}
        icon="sparkles"
        busy={busy}
        disabled={!name.trim() || !email.trim() || password.length < 8}
        onPress={() => { void submit() }}
      />
      <Text style={[fonts.small, { color: C.text3, textAlign: 'center' }]}>
        {tp('portal.join.already')} <Text style={{ color: C.gold }} onPress={() => router.replace('/sign-in')}>{tp('portal.join.sign_in')}</Text>
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  cameraWrap: { height: 300, borderRadius: RADIUS.xl, overflow: 'hidden', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  frame: { width: 190, height: 190, borderRadius: 24, borderWidth: 3 },
  cameraHint: { position: 'absolute', bottom: 16, color: C.text, textAlign: 'center', paddingHorizontal: 16 },
  venue: { alignItems: 'center', gap: 10 },
  logo: { width: 64, height: 64, borderRadius: 32, borderWidth: 1 },
  logoMark: { alignItems: 'center', justifyContent: 'center' },
})
