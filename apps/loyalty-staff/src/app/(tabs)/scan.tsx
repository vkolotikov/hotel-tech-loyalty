import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Animated, FlatList, Linking, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useQuery } from '@tanstack/react-query'
import { CameraView, useCameraPermissions } from 'expo-camera'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { api } from '../../lib/api'
import { failureOf } from '../../lib/failure'
import { cleanCode, errorKey, keyFor, looksLikeCode, type Unanswered } from '../../lib/desk'
import { freshKey } from '../../lib/ids'
import { feel } from '../../lib/haptics'
import { useNfc } from '../../lib/nfc'
import { KEYS, tierOf, useBoot, useScan, whereKey, type ScanWhere } from '../../lib/queries'
import { useT } from '../../lib/i18n'
import type { Key } from '../../lib/i18n/en'
import { C, RADIUS, TAB_BAR_ROOM, fonts, tierColor } from '../../lib/theme'
import type { MemberRow } from '../../lib/types'
import { Avatar, Backdrop, GhostButton, GoldButton, Notice, Pill, Press, Row, SearchField } from '../../components/ui'

/** A code read twice within this time (the camera sees it every frame) is one scan. */
const SAME_READ_MS = 2500

/**
 * Scan: the camera reads a member's QR code, the phone's NFC reader their card, or the staff member types — and the
 * server answers who it is (and, at a place or an event, whether they may enter). Every read goes through the same
 * `POST scan` as the web workspace, with a key of its own that a retry reuses.
 */
export default function Scan() {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const boot = useBoot()
  const { where, setWhere, show } = useScan()
  const [permission, requestPermission] = useCameraPermissions()
  const [focused, setFocused] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Key | null>(null)
  const [typing, setTyping] = useState(false)
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
    if (!code || busy) return
    const now = Date.now()
    if (lastRead.current && lastRead.current.code === code && now - lastRead.current.at < SAME_READ_MS) return
    lastRead.current = { code, at: now }
    feel.read()
    setBusy(true)
    setProblem(null)
    const at = whereKey(where)
    const key = keyFor(code, at, unanswered.current, now, freshKey)
    unanswered.current = { code, where: at, key, at: now }
    try {
      const answer = await api.scan({
        code,
        idempotency_key: key,
        ...(where.kind === 'place' ? { place_id: where.id } : {}),
        ...(where.kind === 'event' ? { event_id: where.id } : {}),
      })
      unanswered.current = null
      if (answer.verdict && !answer.verdict.granted) feel.warning()
      else feel.success()
      show(answer)
      setTyping(false)
      router.push('/scanned')
    } catch (error) {
      const failure = failureOf(error)
      // An answer came, so the next read of this code is a new scan; only "no answer" keeps the key.
      if (failure.code !== 'network') unanswered.current = null
      feel.warning()
      setProblem(failure.code === 'not_found' ? 'scan.unknown' : errorKey(failure.code))
    } finally {
      setBusy(false)
    }
  }, [busy, where, show])

  const nfc = useNfc({ listen: focused && !typing && !busy, onCard: uid => { void lookUp(uid) }, prompt: t('scan.nfcHint') })
  const canScanCamera = Platform.OS !== 'web' && permission?.granted && focused && !typing && !picking

  const whereLabel = where.kind === 'desk' ? t('scan.desk') : where.name

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {canScanCamera ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={light}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={busy ? undefined : result => { void lookUp(result.data) }}
        />
      ) : (
        <Backdrop style={StyleSheet.absoluteFill}><View /></Backdrop>
      )}

      {/* The dimmed surround with the gold frame the code goes in. */}
      <View style={[StyleSheet.absoluteFill, styles.shade]} pointerEvents="none">
        <Frame />
        <Text style={[fonts.bodyStrong, styles.hint]}>{t('scan.qrHint')}</Text>
      </View>

      <View style={[styles.top, { paddingTop: insets.top + 12 }]}>
        <Press onPress={() => setPicking(true)} label={t('scan.for')}>
          <View style={styles.whereChip}>
            <Ionicons name={where.kind === 'desk' ? 'storefront-outline' : where.kind === 'place' ? 'location-outline' : 'calendar-outline'} size={16} color={C.gold} />
            <View>
              <Text style={[fonts.label, { color: C.text2, fontSize: 9.5 }]}>{t('scan.for')}</Text>
              <Text style={[fonts.smallStrong, { color: C.text }]} numberOfLines={1}>{whereLabel}</Text>
            </View>
            <Ionicons name="chevron-down" size={14} color={C.text2} />
          </View>
        </Press>
        {Platform.OS !== 'web' && permission?.granted && (
          <Press onPress={() => setLight(on => !on)} label={t('scan.light')}>
            <View style={[styles.round, light && { backgroundColor: C.gold }]}>
              <Ionicons name={light ? 'flashlight' : 'flashlight-outline'} size={20} color={light ? C.onGold : C.text} />
            </View>
          </Press>
        )}
      </View>

      <View style={[styles.panel, { paddingBottom: TAB_BAR_ROOM - 20 }]}>
        {busy && (
          <View style={styles.busy}><ActivityIndicator color={C.gold} /><Text style={[fonts.bodyStrong, { color: C.text }]}>{t('scan.busy')}</Text></View>
        )}
        {problem && !busy && <Notice text={t(problem)} />}
        {!permission?.granted && Platform.OS !== 'web' && permission && (
          permission.canAskAgain
            ? <GhostButton title={t('scan.cameraAllow')} icon="camera-outline" onPress={() => { void requestPermission() }} />
            : <Notice tone="warning" text={t('scan.cameraDenied')} action={t('scan.nfcSettings')} onAction={() => { void Linking.openSettings() }} />
        )}
        <NfcPart nfc={nfc} disabled={busy} />
        <GhostButton title={t('scan.type')} icon="keypad-outline" onPress={() => setTyping(true)} />
      </View>

      <TypeSheet open={typing} where={where} onClose={() => setTyping(false)} onCode={code => { void lookUp(code) }} busy={busy} problem={problem} />
      <WherePicker open={picking} current={where} onPick={next => { setWhere(next); setPicking(false); unanswered.current = null }} onClose={() => setPicking(false)} tiersKnown={!!boot.data} />
    </View>
  )
}

/** The gold corners of the camera's frame, breathing slowly while the scanner waits. */
function Frame() {
  const pulse = useRef(new Animated.Value(0.6)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.6, duration: 1200, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [pulse])
  const corner = (style: object) => <View style={[styles.corner, style]} />
  return (
    <Animated.View style={[styles.frame, { opacity: pulse }]}>
      {corner({ top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 26 })}
      {corner({ top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 26 })}
      {corner({ bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 26 })}
      {corner({ bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 26 })}
    </Animated.View>
  )
}

/** The NFC part of the panel: a button on iPhone (the system sheet), a listening light on Android, or why not. */
function NfcPart({ nfc, disabled }: { nfc: ReturnType<typeof useNfc>; disabled: boolean }) {
  const { t } = useT()
  if (nfc.state === 'checking') return null
  if (nfc.state === 'none') return <Text style={[fonts.small, { color: C.text3, textAlign: 'center' }]}>{t('scan.nfcNone')}</Text>
  if (nfc.state === 'off') return <Notice tone="warning" text={t('scan.nfcOff')} action={t('scan.nfcSettings')} onAction={nfc.openSettings} />
  if (nfc.continuous) {
    return (
      <View style={styles.listening}>
        <View style={styles.listeningDot} />
        <Ionicons name="card" size={18} color={C.gold} />
        <Text style={[fonts.bodyStrong, { color: C.text }]}>{t('scan.nfcReady')}</Text>
        <Text style={[fonts.small, { color: C.text2, flex: 1 }]} numberOfLines={1}>{t('scan.nfcHint')}</Text>
      </View>
    )
  }
  return <GoldButton title={t('scan.nfc')} icon="card" onPress={() => { void nfc.read() }} disabled={disabled} />
}

/**
 * Typing instead: a search over names, numbers, emails and phones; a member picked opens at the desk, or is scanned
 * at the place or event by their number. Text that looks like a card code can be looked up as one.
 */
function TypeSheet({ open, where, onClose, onCode, busy, problem }: {
  open: boolean
  where: ScanWhere
  onClose: () => void
  onCode: (code: string) => void
  busy: boolean
  problem: Key | null
}) {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const boot = useBoot()
  const [q, setQ] = useState('')
  const [asked, setAsked] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setAsked(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])
  useEffect(() => { if (!open) { setQ(''); setAsked('') } }, [open])
  const found = useQuery({ queryKey: ['find', asked], queryFn: () => api.find(asked), enabled: open && asked.length >= 2 })

  const pick = (member: MemberRow) => {
    if (where.kind === 'desk') {
      onClose()
      router.push(`/member/${member.id}`)
    } else if (member.member_number) {
      onCode(member.member_number)
    }
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetShade} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Text style={[fonts.title, { color: C.text }]}>{t('scan.type')}</Text>
        <SearchField value={q} onChangeText={setQ} placeholder={t('scan.typeHint')} autoFocus onSubmitEditing={() => setAsked(q.trim())} />
        {problem && !busy && <Notice text={t(problem)} />}
        {looksLikeCode(q) && (
          <Row left={<Ionicons name="barcode-outline" size={22} color={C.gold} />} title={t('scan.asCode', { code: cleanCode(q) })} onPress={() => onCode(q)} />
        )}
        <FlatList
          data={found.data?.members ?? []}
          keyExtractor={m => String(m.id)}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 360 }}
          ListEmptyComponent={asked.length >= 2 && found.isFetched ? <Text style={[fonts.body, { color: C.text2, paddingVertical: 16 }]}>{t('scan.noMatch')}</Text> : undefined}
          renderItem={({ item, index }) => {
            const tier = tierOf(boot.data, item.tier_id)
            return (
              <Row
                left={<Avatar name={item.name} color={tier?.color} size={40} />}
                title={item.name}
                line={[item.member_number, item.email ?? item.phone].filter(Boolean).join(' · ')}
                right={tier ? <Pill text={tier.name} color={tierColor(tier.color)} /> : undefined}
                onPress={() => pick(item)}
                last={index === (found.data?.members.length ?? 0) - 1}
              />
            )
          }}
        />
      </View>
    </Modal>
  )
}

/** Where the desk scans for: the desk itself, one of the venue's places, or one of today's events. */
function WherePicker({ open, current, onPick, onClose }: { open: boolean; current: ScanWhere; onPick: (where: ScanWhere) => void; onClose: () => void; tiersKnown: boolean }) {
  const insets = useSafeAreaInsets()
  const { t } = useT()
  const places = useQuery({ queryKey: KEYS.places, queryFn: api.places, enabled: open })
  const events = useQuery({ queryKey: KEYS.events, queryFn: api.eventsToday, enabled: open })
  const options: ScanWhere[] = [
    { kind: 'desk' },
    ...(places.data?.places ?? []).filter(p => p.is_active).map(p => ({ kind: 'place' as const, id: p.id, name: p.name })),
    ...(events.data?.events ?? []).filter(e => e.status === 'published').map(e => ({ kind: 'event' as const, id: e.id, name: e.title })),
  ]
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetShade} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.grabber} />
        <Text style={[fonts.title, { color: C.text }]}>{t('scan.for')}</Text>
        {(places.isLoading || events.isLoading) && <ActivityIndicator color={C.gold} />}
        {options.map((option, i) => {
          const on = whereKey(option) === whereKey(current)
          const icon = option.kind === 'desk' ? 'storefront-outline' : option.kind === 'place' ? 'location-outline' : 'calendar-outline'
          return (
            <Row
              key={whereKey(option)}
              left={<Ionicons name={icon} size={22} color={on ? C.gold : C.text2} />}
              title={option.kind === 'desk' ? t('scan.desk') : option.name}
              right={on ? <Ionicons name="checkmark-circle" size={22} color={C.gold} /> : undefined}
              onPress={() => onPick(option)}
              last={i === options.length - 1}
            />
          )
        })}
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  shade: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(5,7,12,0.35)', paddingBottom: 220 },
  frame: { width: 250, height: 250 },
  corner: { position: 'absolute', width: 54, height: 54, borderColor: C.gold },
  hint: { color: C.text, marginTop: 24, textAlign: 'center', paddingHorizontal: 32, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 8 },
  top: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  whereChip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, backgroundColor: 'rgba(10,13,20,0.82)', borderWidth: 1, borderColor: C.goldEdge, maxWidth: 260 },
  round: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,13,20,0.82)', borderWidth: 1, borderColor: C.hairlineStrong },
  panel: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 20, gap: 12, backgroundColor: 'rgba(9,11,18,0.94)', borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, borderTopWidth: 1, borderColor: C.hairline },
  busy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 6 },
  listening: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: RADIUS.md, backgroundColor: C.goldWash, borderWidth: 1, borderColor: C.goldEdge },
  listeningDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.success },
  sheetShade: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { backgroundColor: C.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl, padding: 20, gap: 14, borderTopWidth: 1, borderColor: C.hairlineStrong },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: C.hairlineStrong },
})
