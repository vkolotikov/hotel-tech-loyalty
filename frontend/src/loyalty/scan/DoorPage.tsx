import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  CalendarDays, Camera, ChevronRight, DoorOpen, Expand, Keyboard, Loader2, LogOut, Nfc, ScanLine, Settings2, Usb, Volume2, VolumeX,
} from 'lucide-react'
import { markShell } from '../../workspace/lib/shellMark'
import { isTyping, modalOpen } from '../../workspace/lib/shortcuts'
import { NAVY_SURFACES, accentStyle, accentTokens } from '../../workspace/theme/accent'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { useBoot, useLoyalty } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { loadBrandPaint, useLook } from '../lib/look'
import { CameraScanner } from './CameraScanner'
import type { Choices } from './ContextPicker'
import { canFullScreen, loadSound, playTones, saveSound, toggleFullScreen, unlockSound, useWakeLock } from './doorDevice'
import { afterGone, afterScan, contextBody, eventsTodayKey, placesKey, scanApi } from './scanApi'
import {
  DESK, activePlaces, contextFromSearch, contextSearch, eventHours, loadContext, openEvents, resolveContext, saveContext, venueWallNow,
  type Resolved, type ScanContext,
} from './scanContext'
import { cameraAttempt, detectEnv, fieldAttempt, modeState, nfcState, usbAttempt, type Attempt, type ScanMode } from './scanMath'
import { NfcPanel } from './ScanPage'
import { TodayCounts } from './TodayHere'
import { useToday } from './useToday'
import { UsbReader } from './UsbReader'
import { useWebNfc } from './useWebNfc'
import {
  answerVerdict, clearsAfter, failureVerdict, goneContext, isDuplicate, nextSeen, soundOf, takesKeyToField, type Seen, type VerdictFacts,
  type VerdictView,
} from './verdict'
import { useSay } from './useSay'
import { Announcer, DoorVerdict } from './VerdictCard'

/**
 * Door mode (release 8, spec 2026-10-25 §2): a full-screen scanner for a tablet or a phone at an entrance, outside the
 * workspace's frame (LoyaltyApp renders it without the shell, so it wears the workspace's tokens itself). The place or
 * event in the corner; the camera scanning continuously once tapped (browsers start a camera only from a press), NFC,
 * a USB reader, or the reader field that a reader which types keeps filling; a verdict that fills the screen and
 * clears after 4 seconds ("Ready — scan the next member"); the same code again within 3 seconds is ignored; an optional
 * two-tone sound; the screen kept awake; Exit asks first. The address names the context (`?place=3`), so a tablet's
 * bookmark opens on its door; without one, the remembered context, or a choice.
 */
export function DoorPage() {
  const loyalty = useLoyalty()
  const look = useLook()
  const [remembered] = useState(loadBrandPaint)
  const accent = accentTokens(loyalty.data ? loyalty.data.accent : remembered?.accent, look.resolved, NAVY_SURFACES[look.resolved])
  // <html data-shell="loyalty"> keeps the full admin's Branding mood typography out, as the shell does.
  useLayoutEffect(() => markShell(document.documentElement, 'loyalty'), [])

  return (
    <div data-workspace="" data-loyalty="" data-door="" data-theme={look.resolved} data-accent-edge={accent.edge ? '' : undefined}
      style={accentStyle(accent) as CSSProperties} className="fixed inset-0 flex flex-col overflow-hidden bg-a-canvas text-a-text">
      {loyalty.data ? <DoorScreen /> : loyalty.isError ? <DoorUnavailable onRetry={loyalty.refetch} /> : <DoorLoading />}
    </div>
  )
}

function DoorLoading() {
  const { t } = useTranslation()
  return (
    <div role="status" className="grid flex-1 place-items-center">
      <p className="flex items-center gap-3 text-lg text-a-text-2"><Loader2 size={22} className="animate-spin" aria-hidden />{t('loyalty.door.starting', 'Starting door mode…')}</p>
    </div>
  )
}

function DoorUnavailable({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="grid flex-1 place-items-center p-6">
      <div className="max-w-md space-y-4 text-center">
        <p className="font-a-display text-3xl">{t('loyalty.door.unavailable', 'Door mode could not start')}</p>
        <p className="text-a-text-2">{t('loyalty.door.unavailable_line', 'Check the connection, then try again.')}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button onClick={onRetry}>{t('loyalty.door.retry', 'Try again')}</Button>
          <Link to="/loyalty/scan" className="inline-flex items-center rounded-full border border-a-border px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">{t('loyalty.door.back', 'Back to Scan')}</Link>
        </div>
      </div>
    </div>
  )
}

/** The context to scan for: the address's, else the one this device remembers; a choice when there is none. */
function DoorScreen() {
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const [wanted, setWanted] = useState<ScanContext>(() => contextFromSearch(location.search) ?? loadContext())
  const [gone, setGone] = useState<'place' | 'event' | null>(null)
  const places = useQuery({ queryKey: placesKey, queryFn: scanApi.places, staleTime: 60_000, retry: 1 })
  const events = useQuery({ queryKey: eventsTodayKey, queryFn: scanApi.eventsToday, staleTime: 60_000, refetchInterval: 60_000, retry: 1 })
  const nowWall = venueWallNow(boot.venue.timezone)
  const placeList = places.data ? activePlaces(places.data.places) : undefined
  const eventList = events.data ? openEvents(events.data.events, nowWall) : undefined
  const resolved = resolveContext(wanted, placeList, eventList)
  const choices: Choices = {
    places: placeList, events: eventList,
    loading: places.isPending || events.isPending, failed: places.isError || events.isError,
    canSetUp: places.data?.can_change ?? false,
  }

  const pick = (next: ScanContext) => {
    setGone(null)
    setWanted(next)
    saveContext(next)
    navigate({ pathname: location.pathname, search: contextSearch(next) }, { replace: true })
  }

  if (resolved.context.kind === 'desk' && !resolved.pending) return <DoorChooser choices={choices} onChoose={pick} gone={gone} />
  const id = resolved.context.kind === 'desk' ? 'desk' : `${resolved.context.kind}-${resolved.context.id}`
  return <DoorScanner key={id} resolved={resolved} nowWall={nowWall} onGone={(what) => { pick(DESK); setGone(what) }} />
}

/** Door mode without a place or an event: choose where this screen scans, in big buttons. */
export function DoorChooser({ choices, onChoose, gone = null }: { choices: Choices; onChoose: (context: ScanContext) => void; gone?: 'place' | 'event' | null }) {
  const { t } = useTranslation()
  const say = useSay()
  const places = choices.places ?? []
  const events = choices.events ?? []
  const none = !choices.loading && !choices.failed && places.length === 0 && events.length === 0
  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto px-4 py-10 sm:px-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="font-a-display text-4xl text-a-text sm:text-5xl">{t('loyalty.door.title', 'Door mode')}</h1>
          <p className="text-lg text-a-text-2">{t('loyalty.door.choose_line', 'Choose where this screen lets members in.')}</p>
        </div>
        {gone && <Notice tone="warning">{say(failureVerdict({ status: 404, code: 'not_found', extra: { gone } }).reason!)}</Notice>}
        {choices.loading && <div className="grid gap-3 sm:grid-cols-2"><Skeleton className="h-20 rounded-2xl" /><Skeleton className="h-20 rounded-2xl" /></div>}
        {choices.failed && <Notice tone="warning">{t('loyalty.door.choose_failed', 'Places and events could not be loaded. Check the connection, then reload this page.')}</Notice>}
        {places.length > 0 && (
          <BigGroup label={t('loyalty.door.places', 'Places')}>
            {places.map(p => <BigChoice key={`p${p.id}`} icon={<DoorOpen size={26} aria-hidden />} title={p.name} onClick={() => onChoose({ kind: 'place', id: p.id })} />)}
          </BigGroup>
        )}
        {events.length > 0 && (
          <BigGroup label={t('loyalty.door.events_today', 'Events today')}>
            {events.map(e => <BigChoice key={`e${e.id}`} icon={<CalendarDays size={26} aria-hidden />} title={e.title} line={eventHours(e)} onClick={() => onChoose({ kind: 'event', id: e.id })} />)}
          </BigGroup>
        )}
        {none && (
          <div className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-5 text-center">
            <p className="text-lg text-a-text">{t('loyalty.door.choose_none', 'There is no place, and no event today, to scan for.')}</p>
            {choices.canSetUp && (
              <Link to="/loyalty/program#places" className="inline-flex items-center gap-2 font-semibold text-a-accent-text hover:underline">
                <Settings2 size={16} aria-hidden />{t('loyalty.door.set_up_places', 'Set up places')}
              </Link>
            )}
          </div>
        )}
        <p className="text-center">
          <Link to="/loyalty/scan" className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-a-accent-text hover:bg-a-accent/10">{t('loyalty.door.back', 'Back to Scan')}</Link>
        </p>
      </div>
    </div>
  )
}

function BigGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-2">
      <p aria-hidden className="text-sm font-semibold uppercase tracking-wide text-a-text-2">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  )
}

function BigChoice({ icon, title, line, onClick }: { icon: ReactNode; title: string; line?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-20 items-center gap-4 rounded-2xl border border-a-border bg-a-surface px-5 py-4 text-left shadow-a-sm transition-colors hover:border-a-accent-text hover:bg-a-surface-2">
      <span className="text-a-accent-text">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xl font-semibold text-a-text">{title}</span>
        {line && <span className="block font-a-mono text-sm text-a-text-2">{line}</span>}
      </span>
      <ChevronRight size={22} aria-hidden className="text-a-text-2" />
    </button>
  )
}

/** The name in the corner: the place, or the event and its hours; a placeholder while the lists load. */
export function DoorWhere({ resolved }: { resolved: Resolved }) {
  if (resolved.place) {
    return <span className="inline-flex min-w-0 items-center gap-2"><DoorOpen size={20} aria-hidden className="shrink-0 text-a-accent-text" /><span className="truncate">{resolved.place.name}</span></span>
  }
  if (resolved.event) {
    return (
      <span className="inline-flex min-w-0 items-center gap-2">
        <CalendarDays size={20} aria-hidden className="shrink-0 text-a-accent-text" />
        <span className="truncate">{resolved.event.title}</span>
        <span className="hidden shrink-0 font-a-mono text-sm text-a-text-2 sm:inline">{eventHours(resolved.event)}</span>
      </span>
    )
  }
  return <Skeleton className="h-6 w-40" />
}

interface Shown {
  view: VerdictView
  key: number
}

/** The scanner at the door: one context, every way in, the verdict over everything, then ready again. */
function DoorScanner({ resolved, nowWall, onGone }: { resolved: Resolved; nowWall: string; onGone: (gone: 'place' | 'event') => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const client = useQueryClient()
  const navigate = useNavigate()
  const env = useMemo(() => detectEnv(), [])
  const context = resolved.context
  const timeZone = boot.venue.timezone
  const today = useToday(context, timeZone)
  const [way, setWay] = useState<ScanMode | null>(null)
  const [shown, setShown] = useState<Shown | null>(null)
  const [drain, setDrain] = useState(false)
  const [sound, setSound] = useState(loadSound)
  const [typing, setTyping] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [code, setCode] = useState('')
  const field = useRef<HTMLInputElement>(null)
  const seen = useRef<Seen>({})
  const busy = useRef(false)
  const queued = useRef<Attempt | null>(null)
  const facts: VerdictFacts = { locale, today: boot.venue.today, nowWall, timeZone, place: resolved.place, event: resolved.event }
  const live = useRef({ facts, sound })
  useEffect(() => { live.current = { facts, sound } })

  useWakeLock(true)

  const show = (view: VerdictView) => {
    setDrain(false)
    setShown({ view, key: Date.now() })
    if (live.current.sound) playTones(soundOf(view.tone))
  }

  const scan = useMutation({
    mutationFn: (attempt: Attempt) => scanApi.scan({ code: attempt.code, idempotency_key: newPressKey(), ...contextBody(context) }),
    onMutate: () => { busy.current = true },
    onSuccess: (answer) => {
      show(answerVerdict(answer, live.current.facts))
      afterScan(client, context, answer.member?.id ?? null)
    },
    onError: (error) => {
      const failure = failureOf(error)
      show(failureVerdict(failure))
      afterScan(client, context, null)
      // The place or event is gone: door mode asks where to scan, and says why.
      const gone = goneContext(failure)
      if (gone) { afterGone(client, gone); onGone(gone) }
    },
    onSettled: () => {
      busy.current = false
      setCode('')
      setTyping(false)
      field.current?.focus()
      // A code read while the last one was being checked goes next.
      const next = queued.current
      queued.current = null
      if (next) scan.mutate(next)
    },
  })

  /** Every way in comes through here: the same code still at the reader is ignored; one read meanwhile waits its turn. */
  const offer = (attempt: Attempt | null) => {
    if (!attempt || attempt.code === '') return
    const now = Date.now()
    const repeat = isDuplicate(seen.current, attempt.code, now)
    seen.current = nextSeen(seen.current, attempt.code, now)
    if (repeat) return
    if (busy.current) { queued.current = attempt; return }
    scan.mutate(attempt)
  }
  const nfc = useWebNfc(offer)

  // The verdict clears after 4 seconds; its bar drains meanwhile (started a frame after it is drawn full).
  useEffect(() => {
    if (!shown) return
    let inner = 0
    const outer = requestAnimationFrame(() => { inner = requestAnimationFrame(() => setDrain(true)) })
    const timer = window.setTimeout(() => { setShown(null); field.current?.focus() }, clearsAfter('door') ?? 0)
    return () => { cancelAnimationFrame(outer); cancelAnimationFrame(inner); window.clearTimeout(timer) }
  }, [shown])

  // A reader that types keeps working wherever the focus went: its first character takes the focus back to the field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (takesKeyToField(e, { typing: isTyping(target), modal: modalOpen(document), onButton: target?.tagName === 'BUTTON' })) field.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const chooseWay = (next: ScanMode) => {
    if (way === 'nfc') nfc.stop()
    setWay(next)
    if (next === 'nfc' && modeState('nfc', env) === 'ready') nfc.start()
    // A reader that types keeps working beside the camera or NFC (the field asks for no on-screen keyboard).
    field.current?.focus()
  }
  const stopWay = () => { if (way === 'nfc') nfc.stop(); setWay(null); field.current?.focus() }
  const toggleSound = () => {
    const next = !sound
    setSound(next)
    saveSound(next)
    if (next) { unlockSound(); playTones(soundOf('granted')) }
  }
  const leave = () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) toggleFullScreen()
    navigate(`/loyalty/scan${contextSearch(context)}`)
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" onPointerDown={unlockSound}>
      {/* Where, and today's numbers, in the corner; on a phone the buttons keep only their icons beside it. */}
      <header className="shrink-0 border-b border-a-border bg-a-surface px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 font-a-display text-xl text-a-text sm:text-2xl"><DoorWhere resolved={resolved} /></div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" variant="secondary" aria-pressed={sound} aria-label={t('loyalty.door.sound', 'Sound')} onClick={toggleSound}>
              {sound ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />}
              <span className="hidden sm:inline">{sound ? t('loyalty.door.sound_on', 'Sound on') : t('loyalty.door.sound_off', 'Sound off')}</span>
            </Button>
            {canFullScreen() && (
              <Button size="sm" variant="secondary" aria-label={t('loyalty.door.full_screen', 'Full screen')} onClick={toggleFullScreen}>
                <Expand size={16} aria-hidden /><span className="hidden sm:inline">{t('loyalty.door.full_screen', 'Full screen')}</span>
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => setLeaving(true)}><LogOut size={16} aria-hidden />{t('loyalty.door.exit', 'Exit')}</Button>
          </div>
        </div>
        <TodayCounts today={today} locale={locale} />
      </header>

      {/* Nothing chosen yet: the ready line, the ways in and the reader field, centred. A way chosen (the camera): it
          takes the screen — above in portrait, beside in landscape — and the rest sits next to it. */}
      <main className={`flex min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-6 ${way === null ? 'flex-col items-center justify-center' : 'flex-col landscape:flex-row'}`}>
        {way !== null && (
          <div className="flex min-h-[16rem] flex-1 flex-col">
            {way === 'camera' && (modeState('camera', env) === 'ready'
              ? <CameraScanner continuous fill onCode={(text) => offer(cameraAttempt(text))} onStop={stopWay} />
              : <WayTrouble onBack={stopWay}>{modeState('camera', env) === 'insecure'
                  ? t('loyalty.scan.camera_insecure', 'The camera works only over a secure (https) connection.')
                  : t('loyalty.scan.camera_unsupported', 'This browser cannot use a camera here. Type the number, or use a reader.')}</WayTrouble>)}
            {way === 'nfc' && <NfcPanel state={nfcState(env, nfc.listening, nfc.trouble)} onStart={nfc.start} onStop={stopWay} />}
            {way === 'usb' && (
              <div className="space-y-3">
                <UsbReader onUid={(uid) => offer(usbAttempt(uid))} />
                <Button variant="secondary" full className="py-3 text-base" onClick={stopWay}>{t('loyalty.door.other_way', 'Scan another way')}</Button>
              </div>
            )}
          </div>
        )}

        <div className={`flex w-full flex-col justify-center gap-6 ${way === null ? 'max-w-3xl' : 'shrink-0 landscape:w-[40%]'}`}>
          <div role="status" className={`flex flex-col gap-3 ${way === null ? 'items-center text-center' : 'items-center text-center landscape:items-start landscape:text-left'}`}>
            {way === null && (
              <span aria-hidden className="grid h-[clamp(4.5rem,14vmin,7rem)] w-[clamp(4.5rem,14vmin,7rem)] place-items-center rounded-full bg-a-accent/10 text-a-accent-text">
                {scan.isPending ? <Loader2 className="h-1/2 w-1/2 animate-spin" /> : <ScanLine className="h-1/2 w-1/2" />}
              </span>
            )}
            <p className="flex items-center gap-3 font-a-display text-[clamp(1.75rem,min(5vw,6vh),3rem)] leading-tight text-a-text">
              {way !== null && (scan.isPending ? <Loader2 size={30} className="shrink-0 animate-spin" aria-hidden /> : <ScanLine size={32} aria-hidden className="shrink-0 text-a-accent-text" />)}
              {scan.isPending ? t('loyalty.door.checking', 'Checking…') : t('loyalty.door.ready', 'Ready — scan the next member')}
            </p>
            <p className="text-base text-a-text-2">{t('loyalty.door.ready_line', 'A QR code, a card or a member number: the answer shows here for a few seconds.')}</p>
          </div>
          {way === null && (
            <div role="group" aria-label={t('loyalty.scan.ways', 'Ways to scan')} className="grid gap-3 sm:grid-cols-2">
              <WayButton icon={<Camera size={30} aria-hidden />} title={t('loyalty.door.way_camera', 'Start the camera')} line={t('loyalty.door.way_camera_line', 'Members hold their QR code up to this screen.')} onClick={() => chooseWay('camera')} />
              {env.webNfc && <WayButton icon={<Nfc size={30} aria-hidden />} title={t('loyalty.door.way_nfc', 'Tap NFC cards')} line={t('loyalty.door.way_nfc_line', 'Members tap their card on the back of this device.')} onClick={() => chooseWay('nfc')} />}
              {env.webHid && <WayButton icon={<Usb size={30} aria-hidden />} title={t('loyalty.door.way_usb', 'USB reader')} line={t('loyalty.door.way_usb_line', 'A card reader plugged into this device.')} onClick={() => chooseWay('usb')} />}
            </div>
          )}
          <form className="flex w-full gap-2" onSubmit={(e) => { e.preventDefault(); offer(fieldAttempt(code)) }}>
            <label className="min-w-0 flex-1">
              <span className="sr-only">{t('loyalty.door.field', 'Reader or member number')}</span>
              <input ref={field} value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" spellCheck={false}
                inputMode={typing ? 'text' : 'none'} enterKeyHint="go" data-door-field=""
                placeholder={t('loyalty.door.field_placeholder', 'Reader ready…')}
                className="w-full rounded-xl border border-a-border bg-a-surface px-4 py-3 font-a-mono text-base text-a-text" />
            </label>
            <Button type="button" variant="secondary" aria-pressed={typing} onClick={() => { setTyping(!typing); field.current?.focus() }}
              aria-label={t('loyalty.door.type', 'Type a number')} title={t('loyalty.door.type', 'Type a number')}>
              <Keyboard size={18} aria-hidden />
            </Button>
            <Button type="submit" loading={scan.isPending}><ScanLine size={16} aria-hidden />{t('loyalty.door.check', 'Check')}</Button>
          </form>
        </div>
      </main>

      <Announcer view={shown?.view ?? null} />
      {shown && (
        <div className="absolute inset-0 z-20">
          <DoorVerdict key={shown.key} view={shown.view} drain={drain} />
          <div className="absolute left-4 top-3 z-30 flex max-w-[60%] rounded-full bg-a-surface/90 px-3 py-1 text-sm font-semibold text-a-text"><DoorWhere resolved={resolved} /></div>
          <button type="button" onClick={() => { setShown(null); field.current?.focus() }}
            className="absolute right-4 top-3 z-30 inline-flex items-center gap-1.5 rounded-full bg-a-surface/90 px-4 py-2 text-sm font-semibold text-a-text">
            {t('loyalty.door.next', 'Next member')}<ChevronRight size={16} aria-hidden />
          </button>
        </div>
      )}

      {leaving && (
        <Dialog title={t('loyalty.door.leave_title', 'Leave door mode?')} onClose={() => setLeaving(false)}>
          <div className="space-y-5">
            <p className="text-sm text-a-text-2">{t('loyalty.door.leave_line', 'This screen stops scanning members in until door mode is opened again.')}</p>
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setLeaving(false)}>{t('loyalty.door.stay', 'Stay')}</Button>
              <Button onClick={leave}><LogOut size={15} aria-hidden />{t('loyalty.door.leave', 'Leave door mode')}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  )
}

function WayButton({ icon, title, line, onClick }: { icon: ReactNode; title: string; line: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-24 items-center gap-4 rounded-2xl border border-a-border bg-a-surface px-5 py-4 text-left shadow-a-sm transition-colors hover:border-a-accent-text hover:bg-a-surface-2">
      <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-a-accent/10 text-a-accent-text">{icon}</span>
      <span className="min-w-0">
        <span className="block text-xl font-semibold text-a-text">{title}</span>
        <span className="block text-sm text-a-text-2">{line}</span>
      </span>
    </button>
  )
}

function WayTrouble({ children, onBack }: { children: ReactNode; onBack: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-3">
      <Notice tone="warning">{children}</Notice>
      <Button variant="secondary" full className="py-3 text-base" onClick={onBack}>{t('loyalty.door.other_way', 'Scan another way')}</Button>
    </div>
  )
}
