import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Linking, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { api } from '../../lib/api'
import { failureOf } from '../../lib/failure'
import { outcomeUncertain } from '../../lib/attempts'
import { cleanCode, errorKey, keyFor, looksLikeCode, type Unanswered } from '../../lib/desk'
import { freshKey } from '../../lib/ids'
import { feel } from '../../lib/haptics'
import { useNfc } from '../../lib/nfc'
import { KEYS, tierOf, useBoot, useScan, whereKey, type ScanWhere } from '../../lib/queries'
import { useT, type Key } from '../../lib/i18n'
import { C, TAB_BAR_ROOM, fonts, tierColor } from '../../lib/theme'
import type { MemberRow } from '../../lib/types'
import { Avatar, Backdrop, GhostButton, GoldButton, IconBadge, Notice, PageHeading, Pill, Row, SearchField, Segments, Surface } from '../../components/ui'
import { DetailModal } from '../../components/Sheet'
import { EclipseIcon } from '../../components/Eclipse'
import { Glyph } from '../../components/Glyph'

type ScanMode = 'qr' | 'nfc' | 'number'
const SAME_READ_MS = 2500

export default function Scan() {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const { where, setWhere, show } = useScan()
  const [permission, requestPermission] = useCameraPermissions()
  const [focused, setFocused] = useState(false)
  const [mode, setMode] = useState<ScanMode>('qr')
  const [busy, setBusy] = useState(false)
  const sending = useRef(false)
  const [problem, setProblem] = useState<Key | null>(null)
  const [picking, setPicking] = useState(false)
  const [light, setLight] = useState(false)
  const lastRead = useRef<{ code: string; at: number } | null>(null)
  const unanswered = useRef<Unanswered | null>(null)

  useFocusEffect(useCallback(() => {
    setFocused(true)
    setProblem(null)
    lastRead.current = null
    return () => setFocused(false)
  }, []))

  const lookUp = useCallback(async (raw: string) => {
    const code = cleanCode(raw)
    if (!code || sending.current) return
    const now = Date.now()
    if (lastRead.current?.code === code && now - lastRead.current.at < SAME_READ_MS) return
    sending.current = true
    lastRead.current = { code, at: now }
    feel.read()
    setBusy(true)
    setProblem(null)
    const at = whereKey(where)
    const key = keyFor(code, at, unanswered.current, now, freshKey)
    unanswered.current = { code, where: at, key, at: now }
    try {
      const answer = await api.scan({ code, idempotency_key: key,
        ...(where.kind === 'place' ? { place_id: where.id } : {}),
        ...(where.kind === 'event' ? { event_id: where.id } : {}),
      })
      unanswered.current = null
      if (answer.verdict && !answer.verdict.granted) feel.warning()
      else feel.success()
      show(answer)
      router.push('/scanned')
    } catch (error) {
      const failure = failureOf(error)
      if (!outcomeUncertain(error)) unanswered.current = null
      feel.warning()
      setProblem(failure.code === 'not_found' ? 'scan.unknown' : errorKey(failure.code))
    } finally { sending.current = false; setBusy(false) }
  }, [where, show])

  const nfc = useNfc({ listen: focused && mode === 'nfc' && !picking && !busy, onCard: uid => { void lookUp(uid) }, prompt: t('scan.nfcHint') })
  const canCamera = Platform.OS !== 'web' && permission?.granted && focused && mode === 'qr' && !picking
  return <Backdrop>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 20, paddingHorizontal: 24, paddingBottom: TAB_BAR_ROOM, gap: 14 }}>
      <PageHeading title={t('home.scan')} />
      <Row card title={where.kind === 'desk' ? t('scan.desk') : where.name} line={t('scan.for')} left={<IconBadge name="location-outline" color={C.text} />} onPress={busy ? undefined : () => setPicking(true)} />
      <Segments<ScanMode> value={mode} onChange={next => { if (!busy) { setMode(next); setProblem(null); setLight(false) } }} items={['qr', 'nfc', 'number'].map(id => ({ id: id as ScanMode, label: t(`scan.mode.${id}` as Key) }))} />
      {mode === 'qr' && <>
        <Surface padding={0}>
          <View style={{ height: 230, overflow: 'hidden', borderRadius: 25, alignItems: 'center', justifyContent: 'center' }}>
            {canCamera && <CameraView style={StyleSheet.absoluteFill} facing="back" enableTorch={light} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={busy ? undefined : result => { void lookUp(result.data) }} />}
            <View pointerEvents="none"><EclipseIcon name="scanFrame" size={174} /></View>
          </View>
        </Surface>
        <Text style={[fonts.small, { color: C.text2 }]}>{t('scan.qrHint')}</Text>
        {!permission?.granted && Platform.OS !== 'web' && permission && (permission.canAskAgain
          ? <GoldButton title={t('scan.cameraAllow')} icon="camera-outline" onPress={() => { void requestPermission() }} />
          : <Notice tone="warning" text={t('scan.cameraDenied')} action={t('scan.nfcSettings')} onAction={() => { void Linking.openSettings() }} />)}
        {permission?.granted && Platform.OS !== 'web' && <GhostButton title={t('scan.light')} icon={light ? 'flashlight' : 'flashlight-outline'} onPress={() => setLight(v => !v)} />}
        <GhostButton title={t('scan.type')} icon="keypad-outline" disabled={busy} onPress={() => setMode('number')} />
      </>}
      {mode === 'nfc' && <>
        <Surface style={{ paddingVertical: 28, alignItems: 'center', gap: 16 }}>
          <IconBadge name="radio-outline" color={C.gold} size={64} />
          <Text style={[fonts.heading, { color: C.gold, textAlign: 'center' }]}>{t(nfc.state === 'checking' ? 'common.loading' : nfc.state === 'ready' ? 'scan.nfcReady' : 'scan.mode.nfc')}</Text>
          <Text style={[fonts.small, { color: C.text2, textAlign: 'center' }]}>{t(nfc.state === 'none' ? 'scan.nfcNone' : 'scan.nfcHint')}</Text>
        </Surface>
        {nfc.state === 'off' && <Notice tone="warning" text={t('scan.nfcOff')} action={t('scan.nfcSettings')} onAction={nfc.openSettings} />}
        {nfc.state === 'ready' && !nfc.continuous && <GoldButton title={t('scan.nfc')} icon="radio-outline" disabled={busy} onPress={() => { void nfc.read() }} />}
        <GhostButton title={t('scan.type')} icon="keypad-outline" disabled={busy} onPress={() => setMode('number')} />
      </>}
      {mode === 'number' && <MemberLookup where={where} busy={busy} onCode={code => { void lookUp(code) }} />}
      {busy && <View style={{ alignItems: 'center', gap: 8 }}><ActivityIndicator color={C.gold} /><Text style={[fonts.small, { color: C.text }]}>{t('scan.busy')}</Text></View>}
      {problem && !busy && <Notice text={t(problem)} />}
    </ScrollView>
    <WherePicker open={picking} current={where} onPick={next => { setWhere(next); setPicking(false); lastRead.current = null }} onClose={() => setPicking(false)} />
  </Backdrop>
}

/** Manual lookup shares the same context and scan operation as QR/NFC. */
function MemberLookup({ where, onCode, busy }: { where: ScanWhere; onCode: (code: string) => void; busy: boolean }) {
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
  return <View style={{ gap: 14 }}>
    <SearchField value={q} onChangeText={setQ} placeholder={t('scan.typeHint')} editable={!busy} onSubmitEditing={() => { if (looksLikeCode(q)) onCode(q); else setAsked(q.trim()) }} />
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
