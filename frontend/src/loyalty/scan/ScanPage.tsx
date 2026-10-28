import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, Link2, Nfc, RotateCcw, Square } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
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
import { afterGone, afterScan, contextBody, eventsTodayKey, placesKey, scanApi, type ScanAnswer } from './scanApi'
import {
  DESK, activePlaces, contextFromSearch, contextSearch, loadContext, openEvents, resolveContext, saveContext, venueWallNow, type ScanContext,
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
import { Announcer } from './VerdictCard'
import { useTypedPhrase } from './useTypedPhrase'

import { OverviewButton } from '../overview/OverviewUI'
import { DesignDialog } from '../redesign/DesignUI'
import { overviewScope } from '../overview/overviewMath'
import { useScanWords } from './design/words'
import { ScanReader } from './design/ScanReader'
import { ScanMember } from './design/ScanMember'
import { ScanDoor } from './design/ScanDoor'
import { ManualLookup } from './design/ManualLookup'
import './design/scan.css'


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
  const words = useScanWords()
  const [options, setOptions] = useState(false)
  const [manual, setManual] = useState(false)
  const [reader, setReader] = useState<ScanMode>(() => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 'nfc' : 'camera')
  const sending = useRef(false)
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

  const places = useQuery({ queryKey: [...placesKey, overviewScope(boot)], queryFn: scanApi.places, staleTime: 60_000, retry: 1 })
  const events = useQuery({ queryKey: [...eventsTodayKey, overviewScope(boot)], queryFn: scanApi.eventsToday, staleTime: 60_000, refetchInterval: 60_000, retry: 1 })
  const timeZone = boot.venue.timezone
  const nowWall = venueWallNow(timeZone)
  const placeList = places.data ? activePlaces(places.data.places) : undefined
  const eventList = events.data ? openEvents(events.data.events, nowWall) : undefined
  const resolved = resolveContext(wanted, placeList, eventList)
  const context = resolved.context
  const typedPhrase = useTypedPhrase()
  const facts: VerdictFacts = { locale, today: boot.venue.today, nowWall, timeZone, place: resolved.place, event: resolved.event, typedPhrase }
  const today = useToday(context, timeZone, overviewScope(boot))

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
    onMutate: () => { setMode(null); nfc.stop(); setManual(false); setShown(null); setRenewKey(newPressKey()) },
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
      sending.current = false
      // A reader that types may have begun the next code meanwhile: only the code sent is cleared.
      if (attempt.source === 'field') setCode(current => fieldAfter(current, attempt.code))
      if (refocusAfter(attempt.source)) field.current?.focus()
    },
  })
  // Each scan is sent for the context chosen when it is read (useWebNfc keeps the latest of this function).
  const send = (attempt: Attempt | null) => {
    if (!attempt || attempt.code === '' || sending.current) return
    sending.current = true
    scan.mutate({ attempt, context, key: keyFor(attempt.code, contextSearch(context) || 'desk', unanswered.current, Date.now(), newPressKey) })
  }
  const nfc = useWebNfc(send, true)

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
    if (sending.current) return
    stopMode()
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

  const contextName = context.kind === 'desk' ? words('desk') : resolved.place?.name ?? resolved.event?.title ?? words(context.kind === 'event' ? 'event' : 'door')
  const nextMember = () => { stopMode(); setShown(null); scan.reset(); renew.reset(); choose(reader) }
  const codeField = <form className="l-sc-code" onSubmit={e => { e.preventDefault(); send(fieldAttempt(code)) }}><label>{words('rawCode')}<input ref={field} value={code} onChange={e => setCode(e.target.value)} autoComplete="off" spellCheck={false} /></label><OverviewButton type="submit" disabled={scan.isPending || !code.trim()}>{words('find')}</OverviewButton></form>
  return (
    <div className="l-sc-page">
      <div ref={result} className={shown || deskFailure ? 'l-sc-stack' : 'l-sc-empty-result'}>
        {deskFailure && attempt && <ScanTroubleNotice failure={deskFailure} attempt={attempt} onLink={setLinking} />}
        {shown?.kind === 'desk' && shown.linked && <Notice tone="success">{t('loyalty.scan.linked', 'The card is linked to {{name}}. Their next tap finds them.', { name: shown.member.name || shown.member.member_number || '' })}</Notice>}
        {shown?.kind === 'desk' && <ScanMember key={`${shown.member.id}-${shown.key}`} member={shown.member} onNext={nextMember} />}
                    {/* A place or an event: the verdict, said aloud (the region is always there, so a new verdict is announced). */}
            <Announcer view={verdict} />
            {verdict && (
              <ScanDoor key={shown!.key} view={verdict} context={shown!.kind === 'verdict' ? shown!.context : context} contextName={contextName} onNext={nextMember} onOptions={() => setOptions(true)} onDesk={() => chooseContext(DESK)}>
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
              </ScanDoor>
            )}
            {shown?.kind === 'linked' && (
              <Notice tone="success">{t('loyalty.door.linked', 'The card is linked to {{name}}. Scan it again to let them in.', { name: shown.member.name || shown.member.member_number || '' })}</Notice>
            )}

      </div>
      {(!shown || shown.kind === 'linked') && <ScanReader reader={reader} active={mode !== null} busy={scan.isPending} contextName={contextName} event={context.kind === 'event'}
        onStart={() => choose(reader)} onOptions={() => { stopMode(); setOptions(true) }} onManual={() => { stopMode(); setManual(true) }} onCamera={() => { stopMode(); setReader('camera'); choose('camera') }}>
        {mode === 'camera' && <CameraPanel env={env} onCode={text => send(cameraAttempt(text))} onStop={stopMode} />}
        {mode === 'nfc' && <NfcDesign state={nfcState(env, nfc.listening, nfc.trouble)} onStart={nfc.start} onStop={stopMode} />}
        {mode === 'usb' && <div className="l-sc-panel"><UsbReader onUid={uid => send(usbAttempt(uid))} />{codeField}</div>}
      </ScanReader>}
      {showsToday(context) && <details className="l-sc-today"><summary>{t('loyalty.door.today', 'Today here')}</summary><TodayHere today={today} locale={locale} /></details>}
      {options && <DesignDialog title={words('options')} onClose={() => setOptions(false)}><div className="l-sc-options l-rd-form"><fieldset><legend>{words('reader')}</legend><div className="l-sc-segments">{(['camera', 'nfc', 'usb'] as const).map(r => <OverviewButton key={r} aria-pressed={reader === r} onClick={() => { stopMode(); setReader(r) }}>{words(r)}</OverviewButton>)}</div></fieldset><ContextPicker resolved={resolved} onChoose={chooseContext} choices={{ places: placeList, events: eventList, loading: places.isPending || events.isPending, failed: places.isError || events.isError, canSetUp: places.data?.can_change ?? false }} /><small>{words(context.kind === 'event' ? 'eventEffects' : context.kind === 'place' ? 'noCheckin' : 'deskEffects')}</small><Link className="l-ov-link" to="/loyalty/guide">{words('readerHelp')}</Link><OverviewButton primary onClick={() => setOptions(false)}>{words('done')}</OverviewButton></div></DesignDialog>}
      {manual && <ManualLookup context={context} onClose={() => setManual(false)} codeField={codeField} onMember={member => { setManual(false); if (context.kind === 'desk') { scan.reset(); setShown({ kind: 'desk', member, key: Date.now(), linked: false }) } else if (member.member_number) send(fieldAttempt(member.member_number)) }} />}
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

function CameraPanel({ env, onCode, onStop }: { env: ScanEnv; onCode: (text: string) => void; onStop: () => void }) {
  const { t } = useTranslation()
  const state = modeState('camera', env)
  if (state === 'insecure') return <Notice tone="warning">{t('loyalty.scan.camera_insecure', 'The camera works only over a secure (https) connection.')}</Notice>
  if (state === 'unsupported') return <Notice tone="warning">{t('loyalty.scan.camera_unsupported', 'This browser cannot use a camera here. Type the number, or use a reader.')}</Notice>
  return <CameraScanner design onCode={onCode} onStop={onStop} />
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


function NfcDesign({ state, onStart, onStop }: { state: NfcPanelState; onStart: () => void; onStop: () => void }) {
  const words = useScanWords()
  const waiting = state === 'listening' || state === 'starting'
  return <div className="l-sc-viewport l-sc-nfc"><Nfc size={24} aria-hidden /><h2>{words(waiting ? 'waiting' : 'nfcUnavailable')}</h2><p>{words(waiting ? 'waitingLine' : 'nfcUnavailableLine')}</p>{!waiting && state !== 'unsupported' && <NfcPanel state={state} onStart={onStart} onStop={onStop} />}{waiting && <OverviewButton onClick={onStop}>{words('stopNfc')}</OverviewButton>}</div>
}
