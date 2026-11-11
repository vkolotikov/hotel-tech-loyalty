import { useState } from 'react'
import { Image, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { router } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SvgXml } from 'react-native-svg'
import { api } from '../../lib/api'
import { failureOf } from '../../lib/failure'
import { KEYS, queryClient, useBoot, useRefreshOnFocus } from '../../lib/queries'
import { singleFlight, walletEnabled } from '../../lib/loyalty'
import { membershipPhrase } from '../../shared/portal'
import { spacedNumber } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts } from '../../lib/theme'
import { Backdrop, GhostButton, Notice, Row, Shimmer, Surface } from '../../components/ui'
import { ScreenHeader } from '../../components/ScreenHeader'
import { MemberIcon } from '../../components/MemberIcon'

/** The QR is always the real server-issued credential and is never animated. */
export default function Card() {
  const insets = useSafeAreaInsets()
  const { t, tp, language } = useT()
  const size = Math.min(232, Math.max(120, useWindowDimensions().width - 96))
  useRefreshOnFocus([KEYS.card, KEYS.boot])
  const boot = useBoot()
  const card = useQuery({ queryKey: KEYS.card, queryFn: api.card, enabled: !!boot.data?.member, staleTime: 10_000 })
  const [refreshing, setRefreshing] = useState(false)
  const [wallet, setWallet] = useState<'apple' | 'google' | null>(null)
  const [walletNote, setWalletNote] = useState<string | null>(null)
  const [run] = useState(singleFlight)
  const member = boot.data?.member
  const membership = membershipPhrase(member?.membership, language)
  const refresh = async () => {
    setRefreshing(true)
    try { await Promise.all([queryClient.invalidateQueries({ queryKey: KEYS.card }), queryClient.invalidateQueries({ queryKey: KEYS.boot })]) }
    finally { setRefreshing(false) }
  }
  const openWallet = async (which: 'apple' | 'google') => {
    if (!walletEnabled(boot.data, Platform.OS, which) || wallet) return
    setWallet(which); setWalletNote(null)
    try {
      let url: string | undefined
      if (which === 'apple') url = (await api.appleWalletLink()).url
      else { const answer = await api.googleWallet(); url = answer.saveUrl ?? answer.save_url }
      if (!url) throw new Error('no url')
      await Linking.openURL(url)
    } catch (error) {
      const status = failureOf(error).status
      setWalletNote(status === 503 || status === 404 ? tp('portal.home.wallet_unavailable') : tp('portal.home.wallet_error'))
    } finally { setWallet(null) }
  }
  const qr = card.data
  return <Backdrop><ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 24, gap: 16 }}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}>
    <ScreenHeader title={t('card.title')} />
    <Surface style={{ gap: 4 }}>
      <Text style={[fonts.heading, { color: C.text }]}>{member?.name ?? ' '}</Text>
      {member?.tier && <Text style={[fonts.small, { color: C.gold }]}>{member.tier.name}</Text>}
    </Surface>
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={[styles.qr, { width: size, height: size }]}>
        {card.isLoading ? <Shimmer height={size - 32} style={{ width: size - 32 }} />
          : qr?.qr_image ? <Image source={{ uri: qr.qr_image }} style={{ width: size - 32, height: size - 32 }} resizeMode="contain" accessibilityLabel={t('card.show')} />
            : qr?.qr_svg ? <View accessible accessibilityLabel={t('card.show')}><SvgXml xml={qr.qr_svg} width={size - 32} height={size - 32} /></View>
              : <Text style={[fonts.small, { color: '#192330', textAlign: 'center' }]}>{t('card.noCode')}</Text>}
      </View>
      <Text style={[fonts.bodyStrong, { color: C.text }]} selectable>{spacedNumber(qr?.member_number ?? member?.member_number)}</Text>
      {membership && <Text style={[fonts.small, { color: membership.tone === 'danger' ? C.danger : membership.tone === 'warning' ? C.warning : C.text2, textAlign: 'center' }]}>{tp(membership.key, membership.fallback, membership.options)}</Text>}
    </View>
    {member?.membership?.state === 'off' && <Notice text={tp('portal.design.membership_off')} />}
    {card.isError && <Notice text={t('card.noCode')} action={tp('portal.common.retry')} onAction={() => { void card.refetch() }} />}
    {walletEnabled(boot.data, Platform.OS, 'apple') && <GhostButton title={tp('portal.home.wallet_apple')} disabled={wallet !== null} busy={wallet === 'apple'} onPress={() => { void run(() => openWallet('apple')) }} />}
    {walletEnabled(boot.data, Platform.OS, 'google') && <GhostButton title={tp('portal.home.wallet_google')} disabled={wallet !== null} busy={wallet === 'google'} onPress={() => { void run(() => openWallet('google')) }} />}
    {walletNote && <Notice tone="info" text={walletNote} />}
    <Surface><Row left={<MemberIcon name="shield" color={C.gold} />} title={tp('portal.design.your_access')} onPress={() => router.push('/programme')} last /></Surface>
  </ScrollView></Backdrop>
}
const styles = StyleSheet.create({ qr: { marginTop: 0, backgroundColor: '#fff', borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center' } })
