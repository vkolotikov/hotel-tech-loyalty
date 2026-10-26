import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Camera, CalendarPlus, Link2, Loader2, Maximize2, Nfc, RotateCcw, ScanLine, Square, Usb } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey, type ApiFailure } from '../lib/api'
import { errorKey, refusalKey } from '../lib/errors'
import type { MemberRow } from '../lib/types'
import { afterMemberChange, membershipApi } from '../membership/api'
import { ERRORS as MEMBERSHIP_ERRORS } from '../membership/errors'
import { extendBody, validityActions } from '../membership/validityMath'
import { CameraScanner } from './CameraScanner'
import { ContextPicker } from './ContextPicker'
import { LinkCardDialog } from './LinkCardDialog'
import { ScannedCard } from './ScannedCard'
import { afterGone, afterScan, contextBody, eventsTodayKey, placesKey, scanApi, type ScanAnswer } from './scanApi'
import {
  DESK, activePlaces, contextFromSearch, contextSearch, doorPath, loadContext, openEvents, resolveContext, saveContext, venueWallNow, type ScanContext,
} from './scanContext'
import {
  cameraAttempt, cardToLink, detectEnv, fieldAfter, fieldAttempt, gotNoAnswer, keyFor, modeState, nfcState, refocusAfter, scanTrouble, usbAttempt,
  type Attempt, type NfcPanelState, type ScanEnv, type ScanMode, type Unanswered,
} from './scanMath'
import { TodayHere } from './TodayHere'
import { useToday } from './useToday'
import { UsbReader } from './UsbReader'
import { useWebNfc } from './useWebNfc'
import { answerVerdict, failureVerdict, goneContext, renewable, showsToday, type VerdictFacts } from './verdict'
import { Announcer, VerdictCard } from './VerdictCard'
import { useTypedPhrase } from './useTypedPhrase'

const INPUT = 'w-full rounded-xl border border-a-border bg-a-surface px-4 py-3 font-a-mono text-base text-a-text'

/** What the page shows after a scan: the desk's member card, or a verdict at a place or an event (answer or refusal). */
type Shown =
  | { kind: 'desk'; member: MemberRow; key: number; linked: boolean }
  | { kind: 'verdict'; context: ScanContext; attempt: Attempt; answer: ScanAnswer | null; failure: ApiFailure | null; key: number }
  | { kind: 'linked'; member: MemberRow; key: number }

/**
 * Scan (spec 2026-10-21 §4.7; release 5, spec 2026-10-23 §3; release 8, spec 2026-10-25 §2). "Scanning for" at the
 * top: the desk, a place or an event, remembered on this device (scanContext.ts); an address that names one
 * (`?event=5`, an event's Start check-in) chooses it. Four ways in, one endpoint (`POST scan`), which reads whatever
 * it is given (CardLookup): the camera, NFC (Chrome on Android), a USB reader (WebHID), and the field, for a reader
 * that types (Enter sends) or a person; the field keeps the focus after the field's and the USB reader's scans.
 *
 * At the desk: the member's card (Award, Redeem, Check in, credit, requests); a card nobody has offers "Link this
 * card". At a place or an event: the verdict (verdict.ts) — green, amber or red, said aloud — and "Today here".
 */
export function ScanPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const client = useQueryClient()
  const location = useLocation()
  const navigate = useNavigate()
  const env = useMemo(() => detectEnv(), [])
  const named = contextFromSearch(location.search)
  const [wanted, setWanted] = useState<ScanContext>(() => {
    const first = named ?? loadContext()
    // An event's Start check-in names it in the address: chosen as if tapped, so the next visit opens on it too.
    if (named) saveContext(named)
    return first
  })

  const places = useQuery({ queryKey: placesKey, queryFn: scanApi.places, staleTime: 60_000, retry: 1 })
  const events = useQuery({ queryKey: eventsTodayKey, queryFn: scanApi.eventsToday, staleTime: 60_000, refetchInterval: 60_000, retry: 1 })
  const timeZone = boot.venue.timezone
  const nowWall = venueWallNow(timeZone)
  const placeList = places.data ? activePlaces(places.data.places) : undefined
  const eventList = events.data ? openEvents(events.data.events, nowWall) : undefined
  const resolved = resolveContext(wanted, placeList, eventList)
  const context = resolved.context
  const typedPhrase = useTypedPhrase()
  const facts: VerdictFacts = { locale, today: boot.venue.today, nowWall, timeZone, place: resolved.place, event: resolved.event, typedPhrase }
  const today = useToday(context, timeZone)

  const [mode, setMode] = useState<ScanMode | null>(null)
  const [code, setCode] = useState('')
  const [shown, setShown] = useState<Shown | null>(null)
  const [linking, setLinking] = useState<string | null>(null)
  const field = useRef<HTMLInputElement>(null)
  const result = useRef<HTMLDivElement>(null)
  // The last scan that got no answer: the same code sent again reuses its key, so the server replays what it did.
  const unanswered = useRef<Unanswered | null>(null)
  // One renewal key per scan: a press sent again after a lost answer renews once, not twice.
  const [renewKey, setRenewKey] = useState(newPressKey)
  // On a phone the answer is below the fold: each new one is brought into view (no further than needed).
  useEffect(() => {
    if (!shown || typeof window === 'undefined') return
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    result.current?.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' })
  }, [shown])
  /** The desk again, remembered, when the place or event scanned for is gone (the verdict on screen says why). */
  const fallBack = () => {
    setWanted(DESK)
    saveContext(DESK)
    if (named) navigate({ pathname: location.pathname, search: '' }, { replace: true })
  }

  const scan = useMutation({
    mutationFn: ({ attempt, context: at, key }: { attempt: Attempt; context: ScanContext; key: string }) =>
      scanApi.scan({ code: attempt.code, idempotency_key: key, ...contextBody(at) }),
    onMutate: () => { setShown(null); setRenewKey(newPressKey()) },
    onSuccess: (answer, { attempt, context: at }) => {
      unanswered.current = null
      setShown(at.kind === 'desk'
        ? { kind: 'desk', member: answer.member, key: Date.now(), linked: false }
        : { kind: 'verdict', context: at, attempt, answer, failure: null, key: Date.now() })
      afterScan(client, at, answer.member?.id ?? null)
    },
    onError: (error, { attempt, context: at, key }) => {
      const failure = failureOf(error)
      unanswered.current = gotNoAnswer(failure) ? { code: attempt.code, where: contextSearch(at) || 'desk', key, at: Date.now() } : null
      // A refused code is a red verdict at a place or an event (and is logged there); the desk says it as before.
      if (at.kind === 'desk') return
      setShown({ kind: 'verdict', context: at, attempt, answer: null, failure, key: Date.now() })
      afterScan(client, at, null)
      // The place or event no longer exists: the page falls back to the desk, and the band says so.
      const gone = goneContext(failure)
      if (gone) { afterGone(client, gone); fallBack() }
    },
    onSettled: (_data, _error, { attempt }) => {
      // A reader that types may have begun the next code meanwhile: only the code sent is cleared.
      if (attempt.source === 'field') setCode(current => fieldAfter(current, attempt.code))
      if (refocusAfter(attempt.source)) field.current?.focus()
    },
  })
  // Each scan is sent for the context chosen when it is read (useWebNfc keeps the latest of this function).
  const send = (attempt: Attempt | null) => {
    if (!attempt || attempt.code === '') return
    scan.mutate({ attempt, context, key: keyFor(attempt.code, contextSearch(context) || 'desk', unanswered.current, Date.now(), newPressKey) })
  }
  const nfc = useWebNfc(send)

  // Release 9: a membership that ran out, renewed on the spot by a manager (MembershipValidity, as the member page
  // does), then the member scanned again by number so the place decides afresh and records it.
  const renew = useMutation({
    mutationFn: ({ member, key }: { member: MemberRow; key: string }) => membershipApi.validity(member.id, extendBody('1y', key)),
    onSuccess: (_answer, { member }) => {
      afterMemberChange(client, member.id)
      if (member.member_number) send(fieldAttempt(member.member_number))
    },
  })

  // A press starts NFC at once (the browser asks for the permission only from a press); the active mode's own button stops it.
  const choose = (next: ScanMode) => {
    if (mode === 'nfc') nfc.stop()
    if (next === mode) { setMode(null); return }
    setMode(next)
    if (next === 'nfc' && modeState('nfc', env) === 'ready') nfc.start()
  }
  const stopMode = () => { if (mode === 'nfc') nfc.stop(); setMode(null) }

  const chooseContext = (next: ScanContext) => {
    setWanted(next)
    saveContext(next)
    scan.reset()
    renew.reset()
    setShown(null)
    // The address no longer decides once someone chose: a reload keeps the choice.
    if (named) navigate({ pathname: location.pathname, search: '' }, { replace: true })
    field.current?.focus()
  }

  const deskFailure = scan.isError && scan.variables?.context.kind === 'desk' ? failureOf(scan.error) : null
  const attempt = scan.variables?.attempt ?? null
  const verdict = shown?.kind === 'verdict'
    ? (shown.answer ? answerVerdict(shown.answer, facts) : failureVerdict(shown.failure!))
    : null
  const verdictLink = shown?.kind === 'verdict' && shown.failure ? cardToLink(scanTrouble(shown.failure, shown.attempt), shown.attempt) : null
  const renewFor = shown?.kind === 'verdict' && renewable(shown.answer) && shown.answer!.member.member_number && validityActions(boot.staff.can, {}).change
    ? shown.answer!.member : null
  const renewFailure = renew.isError ? failureOf(renew.error) : null

  return (
    <div className="space-y-5 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.scan.title', 'Scan')}>
        {context.kind !== 'desk' && (
          <Link to={doorPath(context)} className="hidden items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep sm:inline-flex">
            <Maximize2 size={16} aria-hidden />{t('loyalty.door.open_door', 'Door mode')}
          </Link>
        )}
      </PageHeader>

      {/* Two columns from a laptop up: what to scan for and how on the left, the answer and today's list on the right. */}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)]">
        <div className="space-y-4">
          <ContextPicker resolved={resolved} onChoose={chooseContext} choices={{
            places: placeList,
            events: eventList,
            loading: places.isPending || events.isPending,
            failed: places.isError || events.isError,
            canSetUp: places.data?.can_change ?? false,
          }} />

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); send(fieldAttempt(code)) }}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('loyalty.scan.field', 'Card, QR code or member number')}</span>
              <input ref={field} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
                placeholder={t('loyalty.scan.placeholder', 'Scan or type…')} className={INPUT} />
            </label>
            <Button type="submit" loading={scan.isPending}><ScanLine size={16} aria-hidden />{t('loyalty.scan.find', 'Find')}</Button>
          </form>

          <div className="grid grid-cols-3 gap-2" role="group" aria-label={t('loyalty.scan.ways', 'Ways to scan')}>
            <ModeButton active={mode === 'camera'} onClick={() => choose('camera')} icon={<Camera size={18} aria-hidden />} label={t('loyalty.scan.mode_camera', 'Camera')} />
            <ModeButton active={mode === 'nfc'} onClick={() => choose('nfc')} icon={<Nfc size={18} aria-hidden />} label={t('loyalty.scan.mode_nfc', 'NFC card')} />
            <ModeButton active={mode === 'usb'} onClick={() => choose('usb')} icon={<Usb size={18} aria-hidden />} label={t('loyalty.scan.mode_usb', 'USB reader')} />
          </div>

          {mode !== null && (
            <div>
              {mode === 'camera' && <CameraPanel env={env} onCode={(text) => { setMode(null); send(cameraAttempt(text)) }} onStop={stopMode} />}
              {mode === 'nfc' && <NfcPanel state={nfcState(env, nfc.listening, nfc.trouble)} onStart={nfc.start} onStop={stopMode} />}
              {mode === 'usb' && <UsbReader onUid={(uid) => send(usbAttempt(uid))} />}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div ref={result} className="scroll-mt-4 space-y-5">
            {/* The desk, as releases 5–7 left it. */}
            {deskFailure && attempt && <ScanTroubleNotice failure={deskFailure} attempt={attempt} onLink={setLinking} />}
            {shown?.kind === 'desk' && shown.linked && <Notice tone="success">{t('loyalty.scan.linked', 'The card is linked to {{name}}. Their next tap finds them.', { name: shown.member.name || shown.member.member_number || '' })}</Notice>}
            {shown?.kind === 'desk' && <ScannedCard key={`${shown.member.id}-${shown.key}`} member={shown.member} />}

            {/* A place or an event: the verdict, said aloud (the region is always there, so a new verdict is announced). */}
            <Announcer view={verdict} />
            {verdict && (
              <VerdictCard key={shown!.key} view={verdict}>
                {verdictLink !== null && (
                  <Button className="py-3 text-base" onClick={() => setLinking(verdictLink)}><Link2 size={16} aria-hidden />{t('loyalty.scan.link_card', 'Link this card')}</Button>
                )}
                {shown?.kind === 'verdict' && shown.failure && gotNoAnswer(shown.failure) && (
                  <Button variant="secondary" className="py-3 text-base" loading={scan.isPending} onClick={() => send(shown.attempt)}>
                    <RotateCcw size={16} aria-hidden />{t('loyalty.door.retry', 'Try again')}
                  </Button>
                )}
                {renewFor !== null && (
                  <div className="space-y-2">
                    <Button className="py-3 text-base" loading={renew.isPending} onClick={() => renew.mutate({ member: renewFor, key: renewKey })}>
                      <CalendarPlus size={16} aria-hidden />{t('loyalty.door.renew', 'Renew for 1 year')}
                    </Button>
                    {renewFailure && <Notice tone="danger">{t(...refusalKey('loyalty.membership', MEMBERSHIP_ERRORS, 'validity', renewFailure))}</Notice>}
                  </div>
                )}
              </VerdictCard>
            )}
            {shown?.kind === 'linked' && (
              <Notice tone="success">{t('loyalty.door.linked', 'The card is linked to {{name}}. Scan it again to let them in.', { name: shown.member.name || shown.member.member_number || '' })}</Notice>
            )}
            {!shown && !deskFailure && <Ready checking={scan.isPending} />}
          </div>

          {showsToday(context) && <TodayHere today={today} locale={locale} />}
        </div>
      </div>

      {linking !== null && (
        <LinkCardDialog uid={linking} onClose={() => setLinking(null)}
          onLinked={(member) => {
            setLinking(null)
            scan.reset()
            if (context.kind === 'desk') setShown({ member, key: Date.now(), kind: 'desk', linked: true })
            else setShown({ kind: 'linked', member, key: Date.now() })
            field.current?.focus()
          }} />
      )}
    </div>
  )
}

/** The answer's place before the first scan, from a laptop up: the scanner is ready (or checking). */
function Ready({ checking }: { checking: boolean }) {
  const { t } = useTranslation()
  return (
    <div aria-hidden className="hidden min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-a-border p-8 text-center text-a-text-2 lg:flex">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-a-accent/10 text-a-accent-text">
        {checking ? <Loader2 size={26} className="animate-spin" /> : <ScanLine size={26} />}
      </span>
      <p className="text-base font-medium">{checking ? t('loyalty.door.checking', 'Checking…') : t('loyalty.door.ready', 'Ready — scan the next member')}</p>
    </div>
  )
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: ReactNode; label: string }) {
  return (
    <Button type="button" variant={active ? 'primary' : 'secondary'} full aria-pressed={active} onClick={onClick}
      className="min-h-11 flex-col gap-1 px-2 py-2 text-xs sm:flex-row sm:gap-2 sm:text-sm">
      {icon}<span className="leading-tight">{label}</span>
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
