import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CalendarPlus, CalendarX2, Check, Crown, Gift, QrCode, RotateCcw, ScanLine, X, type LucideIcon } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { useBoot } from '../LoyaltyProvider'
import { useLook } from '../lib/look'
import { TierChip } from '../ui/TierChip'
import { useSay } from '../scan/useSay'
import { answerVerdict, initialsOf, type Mark, type VerdictView } from '../scan/verdict'
import '../scan/verdict.css'
import { DEMO_WORDS } from './words'
import { SCENARIOS, demoAnswer, demoTiers, type Scenario } from './demo'

const MARKS: Record<Mark, LucideIcon> = { check: Check, alert: AlertTriangle, cross: X, retry: RotateCcw }
const SCENARIO_ICONS: Record<Scenario, LucideIcon> = { welcome: Check, ending: AlertTriangle, wrong_tier: Crown, ended: CalendarX2 }

/** How long the card is "read" before the answer shows: long enough to see the line sweep, short enough not to wait. */
const READ_MS = 700

/**
 * "Try a scan": pick one of four members and watch the door answer — the scan line sweeps the card, then the scan
 * screen's own band comes up in its colour with its words (scan/verdict.ts). With less motion asked for, the answer
 * shows at once (and workspace.css stills every animation). A demo: nothing is sent, scanned or recorded.
 */
export function ScanDemo() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [picked, setPicked] = useState<Scenario | null>(null)
  const [reading, setReading] = useState(false)

  useEffect(() => {
    if (!reading) return
    const timer = window.setTimeout(() => setReading(false), READ_MS)
    return () => window.clearTimeout(timer)
  }, [reading, picked])

  const pick = (s: Scenario) => {
    const still = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    setPicked(s)
    setReading(!still)
  }

  const say = (key: keyof typeof DEMO_WORDS) => t(`loyalty.guide.demo.${key}`, DEMO_WORDS[key])
  const tiers = demoTiers(boot.programme.tiers, say)
  const view = picked
    ? answerVerdict(demoAnswer(picked, tiers, say), { locale: i18n.language || 'en', today: boot.venue.today, nowWall: `${boot.venue.today}T12:00`, timeZone: boot.venue.timezone })
    : null

  return (
    <section aria-labelledby="guide-demo" className="grid gap-5 rounded-3xl border border-a-border bg-a-surface p-5 sm:p-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <div className="space-y-1">
          <h2 id="guide-demo" className="flex items-center gap-2 font-a-display text-2xl text-a-text">
            <ScanLine size={20} aria-hidden className="text-a-accent-text" />{t('loyalty.guide.page.demo', 'Try a scan')}
          </h2>
          <p className="text-sm text-a-text-2">{t('loyalty.guide.page.demo_line', 'Pick a member and see what the door says.')}</p>
        </div>
        <div role="group" aria-label={t('loyalty.guide.page.demo', 'Try a scan')} className="grid grid-cols-2 gap-2">
          {SCENARIOS.map(s => {
            const Icon = SCENARIO_ICONS[s]
            const on = picked === s
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => pick(s)} data-tone-pick={s}
                className={`flex min-h-12 items-center gap-2 rounded-2xl border px-3 py-2 text-left text-sm font-medium transition ${on
                  ? 'border-transparent bg-a-accent text-a-accent-ink shadow-a-sm'
                  : 'border-a-border bg-a-surface text-a-text hover:bg-a-surface-2 [@media(hover:hover)]:hover:-translate-y-px'}`}>
                <Icon size={16} aria-hidden className="shrink-0" />{say(s)}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-a-text-2">{t('loyalty.guide.page.demo_note', 'A demo: nothing is scanned or recorded.')}</p>
      </div>

      <div aria-live="polite" className="min-h-64">
        {picked === null && <Idle words={t('loyalty.guide.page.demo_pick', 'Pick an answer to try.')} />}
        {picked !== null && reading && <Reading words={t('loyalty.guide.page.scanning', 'Scanning…')} />}
        {picked !== null && !reading && view && <DemoVerdict key={picked} view={view} ended={picked === 'ended'} />}
      </div>
    </section>
  )
}

/** Before a pick: a member's card, waiting. */
function Idle({ words }: { words: string }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-a-border p-6 text-center text-a-text-2">
      <CardShape />
      <p className="text-sm font-medium">{words}</p>
    </div>
  )
}

/** The card being read: the scan line sweeps it once. */
function Reading({ words }: { words: string }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-4 rounded-2xl bg-a-surface-2 p-6 text-center text-a-text-2">
      <div className="relative">
        <CardShape />
        <span aria-hidden className="absolute inset-x-0 top-0 h-1 animate-a-sweep rounded-full bg-a-accent shadow-a-sm" />
      </div>
      <p role="status" className="text-sm font-medium">{words}</p>
    </div>
  )
}

/** A member's card, drawn: a rounded rectangle with a QR code. */
function CardShape() {
  return (
    <div aria-hidden className="grid h-28 w-44 place-items-center rounded-2xl border border-a-border bg-a-surface shadow-a-sm">
      <QrCode size={52} strokeWidth={1.5} className="text-a-text" />
    </div>
  )
}

/** The answer, as the scan screen draws it: the band in its colour, then the member once with their tier's benefits. */
function DemoVerdict({ view, ended }: { view: VerdictView; ended: boolean }) {
  const { t } = useTranslation()
  const say = useSay()
  const look = useLook()
  const Icon = MARKS[view.mark]
  const name = view.member?.name ?? ''
  return (
    <div data-verdict={view.tone} className="overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-a-sm animate-a-pop">
      <div data-tone={view.tone} className="l-verdict flex items-center gap-4 px-5 py-4">
        <span className="l-verdict-disc grid h-12 w-12 shrink-0 place-items-center rounded-full"><Icon size={28} strokeWidth={2.75} aria-hidden /></span>
        <div className="min-w-0">
          <p className="font-a-display text-3xl leading-tight">{say(view.headline)}</p>
          {view.reason && <p className="mt-0.5 text-base font-semibold">{say(view.reason)}</p>}
        </div>
      </div>
      <div className="space-y-3 p-5">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-a-accent/10 font-semibold text-a-accent-text">{initialsOf(name)}</span>
          <div className="min-w-0 space-y-1">
            <p className="font-a-display text-2xl leading-tight text-a-text">{name}</p>
            <TierChip tier={view.tier} theme={look.resolved} />
          </div>
        </div>
        {view.benefits.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {view.benefits.map(b => (
              <li key={b} className="inline-flex items-center gap-1.5 rounded-full border border-a-border px-3 py-1 text-sm text-a-text">
                <Gift size={14} aria-hidden className="text-a-accent-text" />{b}
              </li>
            ))}
          </ul>
        )}
        {ended && (
          <Button disabled className="py-2.5"><CalendarPlus size={16} aria-hidden />{t('loyalty.door.renew', 'Renew for 1 year')}</Button>
        )}
      </div>
    </div>
  )
}
