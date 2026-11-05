import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Image, Keyboard, Linking, Platform, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { cleanCode, looksLikeCode } from '../../lib/desk'
import { useScanAttempt } from '../../lib/useScanAttempt'
import { feel } from '../../lib/haptics'
import { useNfc } from '../../lib/nfc'
import { KEYS, tierOf, useBoot, useScan, whereKey, type ScanWhere } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import { C, ECLIPSE as E, TAB_BAR_ROOM, fonts, tierColor } from '../../lib/theme'
import { useEclipseAppearance } from '../../lib/useEclipseAppearance'
import type { MemberRow } from '../../lib/types'
import { Avatar, Backdrop, GhostButton, GoldButton, IconBadge, Notice, PageHeading, Pill, Press, Row, SearchField, Segments, Surface } from '../../components/ui'
import { DetailModal } from '../../components/Sheet'
import { ECLIPSE_ASSETS, EclipseIcon, EclipseSurface, useEclipseBorderLight } from '../../components/Eclipse'
import { Glyph } from '../../components/Glyph'

type ScanMode = 'qr' | 'nfc' | 'number'
const SAME_READ_MS = 2500

export default function Scan() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { width, height } = useWindowDimensions()
  const appearance = useEclipseAppearance()
  const phase = useEclipseBorderLight(appearance.animate && !appearance.solid)
  const scanSize = Math.min(width - 2 * E.inset, Math.max(220, Math.min(280, height - insets.top - insets.bottom - 460)))
  const { t } = useT()
  const { where, setWhere, show } = useScan()
  const [permission, requestPermission] = useCameraPermissions()
  const [focused, setFocused] = useState(false)
  const [mode, setMode] = useState<ScanMode>('qr')
  const attempt = useScanAttempt()
  const { busy, pending, problem } = attempt
  const blocked = busy || !!pending || !attempt.ready
  const [reviewing, setReviewing] = useState(false)
  const [picking, setPicking] = useState(false)
  const [light, setLight] = useState(false)
  const lastRead = useRef<{ code: string; at: number } | null>(null)

  useFocusEffect(useCallback(() => {
    setFocused(true)
    lastRead.current = null
    return () => setFocused(false)
  }, []))

  const lookUp = async (raw: string, retry = false) => {
    const code = cleanCode(raw)
    if (!code || busy || (!retry && blocked)) return
    const now = Date.now()
    if (!retry && lastRead.current?.code === code && now - lastRead.current.at < SAME_READ_MS) return
    lastRead.current = { code, at: now }
    feel.read()
    const answer = await attempt.send(code, where, retry)
    if (answer) {
      if (answer.verdict && !answer.verdict.granted) feel.warning()
      else feel.success()
      show(answer)
      router.push('/scanned')
    }
  }

  const nfc = useNfc({ listen: focused && mode === 'nfc' && !picking && !blocked, onCard: uid => { void lookUp(uid) }, prompt: t('scan.nfcHint') })
  const canCamera = Platform.OS !== 'web' && permission?.granted && focused && mode === 'qr' && !picking && !blocked
  const activate = blocked ? undefined : mode === 'qr' && !permission?.granted && permission && Platform.OS !== 'web'
    ? () => { void (permission.canAskAgain ? requestPermission() : Linking.openSettings()) }
    : mode === 'nfc' && nfc.state === 'off' ? nfc.openSettings
    : mode === 'nfc' && nfc.state === 'ready' && !nfc.continuous ? () => { void nfc.read() } : undefined
  const scanLabel = mode === 'qr' ? t(permission?.granted ? 'scan.qrHint' : permission && !permission.canAskAgain ? 'scan.nfcSettings' : 'scan.tap')
    : t(nfc.state === 'checking' ? 'common.loading' : nfc.state === 'ready' ? 'scan.nfcReady' : 'scan.mode.nfc')
  const scanTile = <EclipseSurface tone="scan" radius={E.scanRadius} solid={appearance.solid} borderLight={{ phase, order: 0 }} style={{ minHeight: scanSize - 2 * E.borderLight.width, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 18 }}>
    {!appearance.solid && <>
      <Image source={ECLIPSE_ASSETS.coolRim} pointerEvents="none" accessible={false} style={{ position: 'absolute', width: 181, height: 62, left: -45, top: -30 }} />
      <Image source={ECLIPSE_ASSETS.goldRim} pointerEvents="none" accessible={false} style={{ position: 'absolute', width: 234, height: 78, right: -62, bottom: -36, tintColor: E.accent }} />
    </>}
    {canCamera && <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={light} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={result => { void lookUp(result.data) }} />}
    <View pointerEvents="none">{mode === 'nfc' ? <Glyph name="radio-outline" size={64} color={C.goldLight} /> : <EclipseIcon name={canCamera ? 'scanFrame' : 'scan'} size={canCamera ? 150 : 88} />}</View>
    {!canCamera && <Text style={[fonts.heading, { color: C.text, textAlign: 'center' }]}>{scanLabel}</Text>}
    {mode === 'nfc' && <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>{t(nfc.state === 'none' ? 'scan.nfcNone' : nfc.state === 'off' ? 'scan.nfcOff' : 'scan.nfcHint')}</Text>}
    {canCamera && <View style={{ position: 'absolute', right: 12, bottom: 12 }}><Press label={t('scan.light')} onPress={() => setLight(v => !v)}><Surface padding={12}><Glyph name={light ? 'flashlight' : 'flashlight-outline'} size={22} /></Surface></Press></View>}
  </EclipseSurface>
  return <Backdrop>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 16, paddingHorizontal: E.inset, paddingBottom: TAB_BAR_ROOM, gap: E.gap }}>
      <PageHeading title={t('home.scan')} />
      <Press disabled={blocked} label={`${t('scan.for')}: ${where.kind === 'desk' ? t('scan.desk') : where.name}`} onPress={() => setPicking(true)}>
        <Surface padding={10} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10 }}><Glyph name="location-outline" size={20} color={C.gold} /><Text style={[fonts.bodyStrong, { color: C.text, flex: 1 }]}>{where.kind === 'desk' ? t('scan.desk') : where.name}</Text><Glyph name="chevron-down" size={18} /></Surface>
      </Press>
      {pending && !busy && <Surface style={{ gap: 12 }}>
        <Text style={[fonts.heading, { color: C.text }]}>{t('scan.pendingTitle')}</Text>
        <Text style={[fonts.small, { color: C.text2 }]}>{t(problem === 'scan.retryExpired' ? 'scan.retryExpired' : 'scan.unconfirmed')}</Text>
        <GoldButton title={t('common.retry')} icon="refresh-outline" busy={busy} onPress={() => { void lookUp(pending.code, true) }} />
        <GhostButton title={t('scan.review')} icon="list-outline" disabled={busy} onPress={() => setReviewing(true)} />
      </Surface>}
      {mode !== 'number' && <View style={{ width: scanSize, alignSelf: 'center' }}>{activate ? <Press label={scanLabel} onPress={activate}>{scanTile}</Press> : scanTile}</View>}
      <Segments<ScanMode> disabled={blocked} value={mode} onChange={next => { if (!blocked) { Keyboard.dismiss(); setMode(next); setLight(false) } }} items={[
        { id: 'qr', label: t('scan.mode.qr'), icon: 'qr-code-outline' },
        { id: 'nfc', label: t('scan.mode.nfc'), icon: 'radio-outline' },
        { id: 'number', label: t('scan.mode.number'), symbol: '123' },
      ]} />
      {mode === 'qr' && permission && !permission.granted && !permission.canAskAgain && <Notice tone="warning" text={t('scan.cameraDenied')} />}
      <MemberLookup where={where} busy={blocked} onFocus={() => { setMode('number'); setLight(false) }} onCode={code => { void lookUp(code) }} />
      {busy && <View style={{ alignItems: 'center', gap: 8 }}><ActivityIndicator color={C.gold} /><Text style={[fonts.small, { color: C.text }]}>{t('scan.busy')}</Text></View>}
      {problem && !busy && !['scan.unconfirmed', 'scan.retryExpired'].includes(problem) && <Notice text={t(problem)} />}
    </ScrollView>
    <WherePicker open={picking} current={where} onPick={next => { setWhere(next); setPicking(false); lastRead.current = null }} onClose={() => setPicking(false)} />
    <DetailModal visible={reviewing} title={t('scan.review')} busy={busy} onClose={() => setReviewing(false)}>
      <Notice tone="warning" text={t('scan.reviewHint')} />
      <GoldButton title={t('scan.reviewed')} icon="checkmark" busy={busy} onPress={() => { void attempt.dismiss().then(() => { setReviewing(false); lastRead.current = null }) }} />
      <GhostButton title={t('common.cancel')} disabled={busy} onPress={() => setReviewing(false)} />
    </DetailModal>
  </Backdrop>
}

/** Manual lookup shares the same context and scan operation as QR/NFC. */
function MemberLookup({ where, onCode, busy, onFocus }: { where: ScanWhere; onCode: (code: string) => void; busy: boolean; onFocus: () => void }) {
  const router = useRouter()
  const { t } = useT()
  const boot = useBoot()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  useEffect(() => { const timer = setTimeout(() => setAsked(q.trim()), 300); return () => clearTimeout(timer) }, [q])
  const found = useQuery({ queryKey: ['find', asked], queryFn: () => api.find(asked), enabled: asked.length >= 2 })
  const pick = (member: MemberRow) => {
    if (busy) return
    if (where.kind === 'desk') router.push(`/member/${member.id}`)
    else if (member.member_number) onCode(member.member_number)
  }
  return <View style={{ gap: E.gap }}>
    <SearchField value={q} onChangeText={setQ} onFocus={onFocus} placeholder={t('scan.typeHint')} editable={!busy} onSubmitEditing={() => { if (looksLikeCode(q)) onCode(q); else setAsked(q.trim()) }} />
    {looksLikeCode(q) && <GoldButton title={t('scan.asCode', { code: cleanCode(q) })} icon="search" disabled={busy} onPress={() => onCode(q)} />}
    {found.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void found.refetch() }} />}
    {found.isFetching && <ActivityIndicator color={C.gold} />}
    {asked.length >= 2 && found.isSuccess && !found.data.members.length && <Text style={[fonts.body, { color: C.text2 }]}>{t('scan.noMatch')}</Text>}
    {found.data?.members.map(member => {
      const tier = tierOf(boot.data, member.tier_id)
      return <Row card key={member.id} left={<Avatar name={member.name} color={tier?.color} size={40} />} title={member.name} line={[member.member_number, member.email ?? member.phone].filter(Boolean).join(' · ')}
        right={tier ? <Pill text={tier.name} color={tierColor(tier.color)} /> : undefined} onPress={() => pick(member)} />
    })}
  </View>
}

function WherePicker({ open, current, onPick, onClose }: { open: boolean; current: ScanWhere; onPick: (where: ScanWhere) => void; onClose: () => void }) {
  const { t } = useT()
  const places = useQuery({ queryKey: KEYS.places, queryFn: api.places, enabled: open })
  const events = useQuery({ queryKey: KEYS.events, queryFn: api.eventsToday, enabled: open })
  const options: ScanWhere[] = [{ kind: 'desk' }, ...(places.data?.places ?? []).filter(p => p.is_active).map(p => ({ kind: 'place' as const, id: p.id, name: p.name })), ...(events.data?.events ?? []).filter(e => e.status === 'published').map(e => ({ kind: 'event' as const, id: e.id, name: e.title }))]
  return <DetailModal visible={open} title={t('scan.for')} onClose={onClose}>
    {(places.isLoading || events.isLoading) && <ActivityIndicator color={C.gold} />}
    {places.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void places.refetch() }} />}
    {events.isError && <Notice text={t('error.unknown')} action={t('common.retry')} onAction={() => { void events.refetch() }} />}
    {options.map(option => <Row card key={whereKey(option)} left={<IconBadge name={option.kind === 'event' ? 'calendar-outline' : 'location-outline'} color={C.text} />}
      title={option.kind === 'desk' ? t('scan.desk') : option.name}
      right={whereKey(option) === whereKey(current) ? <Glyph name="checkmark" color={C.gold} /> : undefined} onPress={() => onPick(option)} />)}
  </DetailModal>
}
