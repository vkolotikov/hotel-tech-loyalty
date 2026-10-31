import { useState } from 'react'
import { Image, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SvgXml } from 'react-native-svg'
import { api } from '../../lib/api'
import { failureOf } from '../../lib/failure'
import { KEYS, queryClient, useBoot } from '../../lib/queries'
import { spacedNumber } from '../../lib/format'
import { useT } from '../../lib/i18n'
import { C, RADIUS, SHADOW, TAB_BAR_ROOM, fonts, tierColor, withAlpha } from '../../lib/theme'
import { Backdrop, GhostButton, Notice, Pill, Shimmer } from '../../components/ui'

/**
 * The card for the desk: the member's QR code large on white (the camera reads it in any light), the number to read
 * out, the name and level, and the phone's own wallet. The code is the member number (`GET /v1/member/card`); the
 * server draws it as a PNG, or as SVG where it cannot.
 */
export default function Card() {
  const insets = useSafeAreaInsets()
  const { t, tp } = useT()
  const boot = useBoot()
  const card = useQuery({ queryKey: KEYS.card, queryFn: api.card, staleTime: 10 * 60_000 })
  const [refreshing, setRefreshing] = useState(false)
  const [wallet, setWallet] = useState<'apple' | 'google' | null>(null)
  const [walletNote, setWalletNote] = useState<string | null>(null)

  const member = boot.data?.member
  const venue = boot.data?.venue
  const tone = tierColor(member?.tier?.color_hex)

  const refresh = async () => {
    setRefreshing(true)
    await Promise.all([queryClient.invalidateQueries({ queryKey: KEYS.card }), queryClient.invalidateQueries({ queryKey: KEYS.boot })])
    setRefreshing(false)
  }

  const openWallet = async (which: 'apple' | 'google') => {
    setWallet(which)
    setWalletNote(null)
    try {
      let url: string | undefined
      if (which === 'apple') url = (await api.appleWalletLink()).url
      else {
        const answer = await api.googleWallet()
        url = answer.saveUrl ?? answer.save_url
      }
      if (!url) throw new Error('no url')
      await Linking.openURL(url)
    } catch (error) {
      const status = failureOf(error).status
      setWalletNote(status === 503 || status === 404 ? tp('portal.home.wallet_unavailable') : tp('portal.home.wallet_error'))
    }
    setWallet(null)
  }

  const qr = card.data
  return (
    <Backdrop>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: TAB_BAR_ROOM, paddingHorizontal: 20, gap: 20, alignItems: 'stretch' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { void refresh() }} tintColor={C.gold} />}
      >
        <View style={{ gap: 4 }}>
          <Text style={[fonts.label, { color: C.gold }]} numberOfLines={1}>{venue?.name ?? ' '}</Text>
          <Text style={[fonts.display, { color: C.text }]}>{t('card.title')}</Text>
        </View>

        <View style={[styles.pass, SHADOW.card, { borderColor: withAlpha(tone, 0.5) }]}>
          <View style={styles.passTop}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[fonts.heading, { color: C.text }]} numberOfLines={1}>{member?.name ?? ' '}</Text>
              <Text style={[fonts.small, { color: C.text2 }]}>{tp('portal.home.member_number')}</Text>
            </View>
            {member?.tier && <Pill text={member.tier.name} color={tone} solid />}
          </View>

          <View style={styles.qrFrame}>
            {card.isLoading ? <Shimmer height={232} style={{ width: 232, borderRadius: 16 }} />
              : qr?.qr_image ? <Image source={{ uri: qr.qr_image }} style={styles.qr} resizeMode="contain" accessibilityLabel={t('card.show')} />
                : qr?.qr_svg ? <SvgXml xml={qr.qr_svg} width={232} height={232} />
                  : <Text style={[fonts.small, { color: '#555', textAlign: 'center', padding: 24 }]}>{t('card.noCode')}</Text>}
          </View>

          <Text style={[styles.number, { color: C.text }]} selectable>{spacedNumber(qr?.member_number ?? member?.member_number)}</Text>
          <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>{t('card.show')}</Text>
        </View>

        {card.isError && <Notice text={t('card.noCode')} action={tp('portal.common.retry')} onAction={() => { void card.refetch() }} />}

        <View style={{ gap: 10 }}>
          {(Platform.OS === 'ios' || Platform.OS === 'web') && (
            <GhostButton title={tp('portal.home.wallet_apple')} icon="wallet-outline" disabled={wallet !== null} onPress={() => { void openWallet('apple') }} />
          )}
          {(Platform.OS === 'android' || Platform.OS === 'web') && (
            <GhostButton title={tp('portal.home.wallet_google')} icon="wallet-outline" disabled={wallet !== null} onPress={() => { void openWallet('google') }} />
          )}
          {walletNote && <Notice tone="info" text={walletNote} />}
        </View>
      </ScrollView>
    </Backdrop>
  )
}

const styles = StyleSheet.create({
  pass: { borderRadius: RADIUS.xl, borderWidth: 1, backgroundColor: C.surface, padding: 22, gap: 18, alignItems: 'center' },
  passTop: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'stretch' },
  qrFrame: { backgroundColor: '#ffffff', borderRadius: 22, padding: 18, alignItems: 'center', justifyContent: 'center', minWidth: 268, minHeight: 268 },
  qr: { width: 232, height: 232 },
  number: { fontFamily: 'Inter_700Bold', fontSize: 22, letterSpacing: 3, fontVariant: ['tabular-nums'] },
})
