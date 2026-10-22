import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Camera, Link2, Minus, Nfc, Plus, ScanLine, Square, Usb } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useApi, useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { errorKey } from '../lib/errors'
import { points } from '../lib/format'
import { memberPath } from '../lib/links'
import { useLook } from '../lib/look'
import type { MemberRow } from '../lib/types'
import { PointsDialog } from '../member/PointsDialog'
import { memberActions, type PointsMode } from '../member/memberMath'
import { RequestRow } from '../requests/RequestRow'
import { TierChip } from '../ui/TierChip'
import { CameraScanner } from './CameraScanner'
import { LinkCardDialog } from './LinkCardDialog'
import {
  cameraAttempt, cardToLink, detectEnv, fieldAttempt, modeState, nfcState, refocusAfter, scanTrouble, usbAttempt,
  type Attempt, type NfcPanelState, type ScanEnv, type ScanMode,
} from './scanMath'
import { UsbReader } from './UsbReader'
import { useWebNfc } from './useWebNfc'

const INPUT = 'w-full rounded-xl border border-a-border bg-a-surface px-4 py-3 font-a-mono text-base text-a-text'

/**
 * Scan (spec 2026-10-21 §4.7; release 5, spec 2026-10-23 §3). Four ways in, one endpoint (`POST scan`), which reads
 * whatever it is given (CardLookup): "Scan with camera" (the rear camera, the decoder loaded only then), "Tap NFC
 * card" (Web NFC, Chrome on Android), "USB reader" (WebHID, Chrome or Edge at a desk), and the field, for a reader
 * that types (it ends with Enter, which sends) or a person; the field keeps the focus after the field's and the USB
 * reader's scans. Found: the member's card with Award, Redeem and their open requests. A card no member has, or one
 * switched off here, offers "Link this card".
 */
export function ScanPage() {
  const { t } = useTranslation()
  const api = useApi()
  const env = useMemo(() => detectEnv(), [])
  const [mode, setMode] = useState<ScanMode | null>(null)
  const [code, setCode] = useState('')
  const [shown, setShown] = useState<{ member: MemberRow; key: number; linked: boolean } | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const scan = useMutation({
    mutationFn: (attempt: Attempt) => api.scan(attempt.code),
    onMutate: () => setShown(null),
    onSuccess: (data) => setShown({ member: data.member, key: Date.now(), linked: false }),
    onSettled: (_data, _error, attempt) => {
      if (attempt.source === 'field') setCode('')
      if (refocusAfter(attempt.source)) field.current?.focus()
    },
  })
  const { mutate } = scan
  const send = useCallback((attempt: Attempt | null) => { if (attempt && attempt.code !== '') mutate(attempt) }, [mutate])
  const nfc = useWebNfc(send)

  // A press starts NFC at once (the browser asks for the permission only from a press); the active mode's own button stops it.
  const choose = (next: ScanMode) => {
    if (mode === 'nfc') nfc.stop()
    if (next === mode) { setMode(null); return }
    setMode(next)
    if (next === 'nfc' && modeState('nfc', env) === 'ready') nfc.start()
  }
  const stopMode = () => { if (mode === 'nfc') nfc.stop(); setMode(null) }

  const failure = scan.isError ? failureOf(scan.error) : null
  const attempt = scan.variables ?? null

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.scan.title', 'Scan')} line={t('loyalty.scan.line', 'Scan the member app’s QR code or a card, or type a member number.')} />

      <div className="grid max-w-2xl grid-cols-1 gap-2 sm:grid-cols-3" role="group" aria-label={t('loyalty.scan.ways', 'Ways to scan')}>
        <ModeButton active={mode === 'camera'} onClick={() => choose('camera')} icon={<Camera size={18} aria-hidden />} label={t('loyalty.scan.mode_camera', 'Scan with camera')} />
        <ModeButton active={mode === 'nfc'} onClick={() => choose('nfc')} icon={<Nfc size={18} aria-hidden />} label={t('loyalty.scan.mode_nfc', 'Tap NFC card')} />
        <ModeButton active={mode === 'usb'} onClick={() => choose('usb')} icon={<Usb size={18} aria-hidden />} label={t('loyalty.scan.mode_usb', 'USB reader')} />
      </div>

      {mode !== null && (
        <div className="max-w-2xl">
          {mode === 'camera' && <CameraPanel env={env} onCode={(text) => { setMode(null); send(cameraAttempt(text)) }} onStop={stopMode} />}
          {mode === 'nfc' && <NfcPanel state={nfcState(env, nfc.listening, nfc.trouble)} onStart={nfc.start} onStop={stopMode} />}
          {mode === 'usb' && <UsbReader onUid={(uid) => send(usbAttempt(uid))} />}
        </div>
      )}

      <form className="flex max-w-2xl gap-2" onSubmit={(e) => { e.preventDefault(); send(fieldAttempt(code)) }}>
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t('loyalty.scan.field', 'Card, QR code or member number')}</span>
          <input ref={field} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
            placeholder={t('loyalty.scan.placeholder', 'Scan or type…')} className={INPUT} />
        </label>
        <Button type="submit" loading={scan.isPending}><ScanLine size={16} aria-hidden />{t('loyalty.scan.find', 'Find')}</Button>
      </form>

      {failure && attempt && <ScanTroubleNotice failure={failure} attempt={attempt} onLink={setLinking} />}
      {shown?.linked && <div className="max-w-2xl"><Notice tone="success">{t('loyalty.scan.linked', 'The card is linked to {{name}}. Their next tap finds them.', { name: shown.member.name || shown.member.member_number || '' })}</Notice></div>}
      {shown && <ScannedCard key={`${shown.member.id}-${shown.key}`} member={shown.member} />}
      {linking !== null && (
        <LinkCardDialog uid={linking} onClose={() => setLinking(null)}
          onLinked={(member) => { setLinking(null); scan.reset(); setShown({ member, key: Date.now(), linked: true }) }} />
      )}
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <Button type="button" variant={active ? 'primary' : 'secondary'} full aria-pressed={active} onClick={onClick} className="py-3.5 text-base">
      {icon}{label}
    </Button>
  )
}

function CameraPanel({ env, onCode, onStop }: { env: ScanEnv; onCode: (text: string) => void; onStop: () => void }) {
  const { t } = useTranslation()
  const state = modeState('camera', env)
  if (state === 'insecure') return <Notice tone="warning">{t('loyalty.scan.camera_insecure', 'The camera works only over a secure (https) connection.')}</Notice>
  if (state === 'unsupported') return <Notice tone="warning">{t('loyalty.scan.camera_unsupported', 'This browser cannot use a camera here. Type the number, or use a reader.')}</Notice>
  return <CameraScanner onCode={onCode} onStop={onStop} />
}

export function NfcPanel({ state, onStart, onStop }: { state: NfcPanelState; onStart: () => void; onStop: () => void }) {
  const { t } = useTranslation()
  if (state === 'unsupported') {
    return <Notice tone="info">{t('loyalty.scan.nfc_unsupported', 'NFC works in Chrome on Android phones and tablets; on this device scan the QR code or type the number.')}</Notice>
  }
  const sentence = (() => {
    switch (state) {
      case 'starting': return t('loyalty.scan.nfc_starting', 'Starting NFC… Allow it if the browser asks.')
      case 'listening': return t('loyalty.scan.nfc_listening', 'Hold the card flat against the back of the phone or tablet.')
      case 'denied': return t('loyalty.scan.nfc_denied', 'NFC is blocked for this site. Allow it in the browser’s site settings, then try again.')
      case 'off': return t('loyalty.scan.nfc_off', 'Turn NFC on in the device’s settings, then try again.')
      case 'unreadable': return t('loyalty.scan.nfc_unreadable', 'This card could not be read. Hold it still against the device and try again.')
      default: return t('loyalty.scan.nfc_failed', 'NFC could not start. Try again, or type the number.')
    }
  })()
  const failed = state !== 'starting' && state !== 'listening' && state !== 'unreadable'

  return (
    <div className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      <p role="status" className="flex items-center gap-3 text-base text-a-text">
        <Nfc size={28} className={`shrink-0 text-a-accent-text ${state === 'listening' ? 'animate-pulse' : ''}`} aria-hidden />
        <span>{sentence}</span>
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {failed && <Button full className="py-3 text-base" onClick={onStart}><Nfc size={16} aria-hidden />{t('loyalty.scan.nfc_retry', 'Try NFC again')}</Button>}
        <Button variant="secondary" full className="py-3 text-base" onClick={onStop}><Square size={16} aria-hidden />{t('loyalty.scan.nfc_stop', 'Stop NFC')}</Button>
      </div>
    </div>
  )
}

/** A refused scan in the workspace's words; a card nobody has, or one switched off here, offers "Link this card". */
export function ScanTroubleNotice({ failure, attempt, onLink }: { failure: ApiFailure; attempt: Attempt; onLink: (uid: string) => void }) {
  const { t } = useTranslation()
  const trouble = scanTrouble(failure, attempt)
  const card = cardToLink(trouble, attempt)
  return (
    <div className="max-w-2xl space-y-2">
      <Notice tone="warning">
        {trouble === 'card_unknown' ? t('loyalty.scan.card_unknown', 'No member has this card yet.')
          : trouble === 'card_off' ? t('loyalty.scan.card_off', 'This card was switched off. Link it again to give it to a member.')
          : t(...errorKey('scan', failure))}
      </Notice>
      {card !== null && (
        <Button className="py-3 text-base" onClick={() => onLink(card)}><Link2 size={16} aria-hidden />{t('loyalty.scan.link_card', 'Link this card')}</Button>
      )}
    </div>
  )
}

/** The member a scan found: name, tier, points; Award and Redeem; the tier's benefits and what they asked for. */
function ScannedCard({ member }: { member: MemberRow }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const api = useApi()
  const look = useLook()
  const [dialog, setDialog] = useState<PointsMode | null>(null)
  const detail = useQuery({ queryKey: ['loyalty', 'member', member.id], queryFn: () => api.member(member.id) })
  const now = detail.data?.member ?? member
  const tier = boot.programme.tiers.find(tr => tr.id === now.tier_id) ?? null
  const actions = memberActions(boot.staff.can)

  return (
    <section aria-label={now.name} className="max-w-2xl space-y-4 rounded-2xl border border-a-border bg-a-surface p-5 shadow-a-sm animate-a-pop">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Link to={memberPath(now.id)} className="block font-a-display text-3xl text-a-text hover:underline">{now.name || now.member_number}</Link>
          <div className="flex flex-wrap items-center gap-2 text-sm text-a-text-2">
            <TierChip tier={tier} theme={look.resolved} />
            {now.member_number && <span className="font-a-mono">{now.member_number}</span>}
          </div>
        </div>
        <p className="text-right">
          <span className="block font-a-display text-4xl font-light tabular-nums text-a-text">{points(now.points, locale)}</span>
          <span className="text-xs text-a-text-2">{t('loyalty.scan.points', 'points')}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {actions.award && <Button onClick={() => setDialog('award')}><Plus size={15} aria-hidden />{t('loyalty.member.award', 'Award points')}</Button>}
        {actions.redeem && <Button variant="secondary" onClick={() => setDialog('redeem')}><Minus size={15} aria-hidden />{t('loyalty.member.redeem', 'Redeem points')}</Button>}
        <Link to={memberPath(now.id)} className="inline-flex items-center rounded-full px-3 py-2 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10">{t('loyalty.scan.open', 'Open member')}</Link>
      </div>
      {!detail.data && detail.isLoading && <Skeleton className="h-16" />}
      {detail.data && detail.data.benefits.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.member.benefits_title', 'Tier benefits')}</p>
          <ul className="flex flex-wrap gap-2">
            {detail.data.benefits.map(b => <li key={b.id} className="rounded-full bg-a-surface-2 px-2.5 py-1 text-xs text-a-text">{b.name}{b.value ? ` · ${b.value}` : ''}</li>)}
          </ul>
        </div>
      )}
      {detail.data && detail.data.requests.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-a-text-2">{t('loyalty.member.requests_title', 'Requests')}</p>
          <ul className="-mx-5 divide-y divide-a-border">{detail.data.requests.map(r => <RequestRow key={r.id} request={r} showMember={false} compact />)}</ul>
        </div>
      )}
      {dialog && <PointsDialog mode={dialog} memberId={now.id} name={now.name} balance={now.points} onClose={() => setDialog(null)} />}
    </section>
  )
}
