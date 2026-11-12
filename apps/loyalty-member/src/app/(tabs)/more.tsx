import { useState } from 'react'
import { Linking, Platform, ScrollView, Share, Text } from 'react-native'
import { router, usePreventRemove } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import Constants from 'expo-constants'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { KEYS, forgetLook, queryClient, useBoot, useRefreshOnFocus } from '../../lib/queries'
import { useSession } from '../../lib/session'
import { singleFlight } from '../../lib/loyalty'
import { useVersionCheck } from '../../lib/appVersion'
import { updateUrl } from '../../lib/version'
import { useT } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { Backdrop, GhostButton, Notice, Row, Surface } from '../../components/ui'
import { ScreenHeader } from '../../components/ScreenHeader'
import { MemberIcon } from '../../components/MemberIcon'
import { ActionPopup } from '../../components/ActionPopup'

export default function More() {
  const insets = useSafeAreaInsets()
  const { t, tp } = useT()
  const boot = useBoot()
  useRefreshOnFocus(MORE_FACTS)
  const user = useSession(s => s.user)
  const [problem, setProblem] = useState<string | null>(null)
  const [confirmOut, setConfirmOut] = useState(false)
  const [busy, setBusy] = useState(false)
  const [run] = useState(singleFlight)
  usePreventRemove(busy, () => {})
  const versionState = useVersionCheck(s => s.state)
  const storeUrl = updateUrl(useVersionCheck(s => s.versions), Platform.OS)
  const member = boot.data?.member
  const referral = useQuery({ queryKey: ['referral'], queryFn: api.referral, enabled: !!member && !!boot.data?.capabilities.loyalty })
  const invite = () => { void run(async () => {
    setProblem(null)
    try {
      const owner = useSession.getState().token
      const answer = referral.data ?? await queryClient.fetchQuery({ queryKey: ['referral'], queryFn: api.referral })
      if (owner !== useSession.getState().token) return
      if (!answer?.referral_link || answer.enabled === false) { setProblem(tp('portal.profile.invite_unavailable')); return }
      await Share.share({ message: answer.referral_link, url: answer.referral_link })
    } catch { setProblem(tp('portal.profile.invite_unavailable')) }
  }).catch(() => {}) }
  const signOut = async () => {
    setBusy(true)
    try { await useSession.getState().signOut(); if (!useSession.getState().token) await forgetLook() }
    finally { setBusy(false) }
  }
  return <Backdrop><ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 24, gap: 16 }}>
    <ScreenHeader title={t('more.title')} />
    <Surface style={{ gap: 6 }}>
      <Text style={[fonts.title, { color: C.text }]}>{member?.name ?? user?.name}</Text>
      <Text style={[fonts.small, { color: C.gold }]}>{[member?.tier?.name, boot.data?.venue.name].filter(Boolean).join(' · ')}</Text>
    </Surface>
    <Surface padding={0} style={{ paddingHorizontal: 16 }}>
      <Row left={<MemberIcon name="user" />} title={tp('portal.profile.title')} onPress={() => router.push('/profile')} />
      {member && <Row left={<MemberIcon name="shield" />} title={tp('portal.help.how')} onPress={() => router.push('/programme')} />}
      {!!boot.data?.capabilities.loyalty && <Row left={<MemberIcon name="gift" />} title={tp('portal.profile.invite_title')} onPress={invite} />}
      <Row left={<MemberIcon name="more" />} title={t('more.preferences')} onPress={() => router.push('/preferences')} />
      <Row left={<MemberIcon name="mail" />} title={tp('portal.help.title')} onPress={() => router.push('/help')} last />
    </Surface>
    {problem && <Notice text={problem} />}
    {versionState === 'update_available' && <Notice tone="info" text={t('update.available')} action={storeUrl ? t('update.now') : undefined} onAction={storeUrl ? () => { void Linking.openURL(storeUrl) } : undefined} />}
    <GhostButton title={t('more.signOut')} tone={C.danger} onPress={() => setConfirmOut(true)} />
    <Text style={[fonts.small, { color: C.text3, textAlign: 'center' }]}>{t('brand')} · {t('more.version', { v: Constants.expoConfig?.version ?? '2.1.0' })}</Text>
    <ActionPopup visible={confirmOut} title={t('more.signOut')} busy={busy} onClose={() => setConfirmOut(false)}>
      <Text style={[fonts.body, { color: C.text2 }]}>{t('more.signOutAsk')}</Text>
      <GhostButton title={t('more.signOut')} tone={C.danger} busy={busy} onPress={() => { void run(signOut).catch(() => {}) }} />
    </ActionPopup>
  </ScrollView></Backdrop>
}
const MORE_FACTS = [KEYS.boot] as const
