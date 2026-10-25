import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CalendarClock, Check, Gift, RotateCcw, Sparkles, X, type LucideIcon } from 'lucide-react'
import { memberPath } from '../lib/links'
import { useLook } from '../lib/look'
import { TierChip } from '../ui/TierChip'
import { useSay } from './useSay'
import { CLEAR_AFTER_MS, type Mark, type VerdictView } from './verdict'
import './verdict.css'

const MARKS: Record<Mark, LucideIcon> = { check: Check, alert: AlertTriangle, cross: X, retry: RotateCcw }

/** What a screen reader hears when a verdict comes: the band's two lines (the region is always there, so it is announced). */
export function Announcer({ view }: { view: VerdictView | null }) {
  const say = useSay()
  return (
    <p className="sr-only" aria-live="assertive" aria-atomic="true">
      {view ? [say(view.headline), view.reason ? say(view.reason) : ''].filter(Boolean).join('. ') : ''}
    </p>
  )
}

/**
 * A verdict on the scan page (spec 2026-10-25 §2): the full-width band — its tone's colour, an icon and the words
 * ("Welcome, Ada" / "No access" and why / amber "Membership ends in 5 days") — and under it the member: name, tier
 * chip, number, valid until, the tier's benefits and, at an event, the check-in's facts.
 */
export function VerdictCard({ view, children }: { view: VerdictView; children?: ReactNode }) {
  const say = useSay()
  const Icon = MARKS[view.mark]
  return (
    <section data-verdict={view.tone} aria-label={say(view.headline)} className="overflow-hidden rounded-2xl border border-a-border bg-a-surface shadow-a-sm animate-a-pop">
      <div data-tone={view.tone} className="l-verdict flex items-center gap-4 px-5 py-5 sm:px-6">
        <span className="l-verdict-disc grid h-14 w-14 shrink-0 place-items-center rounded-full sm:h-16 sm:w-16">
          <Icon size={34} strokeWidth={2.75} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="font-a-display text-3xl leading-tight sm:text-4xl">{say(view.headline)}</p>
          {view.reason && <p className="mt-1 text-base font-semibold sm:text-lg">{say(view.reason)}</p>}
        </div>
      </div>
      {(view.member || children) && (
        <div className="space-y-4 p-5 sm:px-6">
          {view.member && <MemberFacts view={view} size="page" />}
          {children}
        </div>
      )}
    </section>
  )
}

/**
 * The member under a verdict: on the page the name opens their page; at the door it is only read (a tablet at an
 * entrance does not leave the scanner).
 */
export function MemberFacts({ view, size }: { view: VerdictView; size: 'page' | 'door' }) {
  const { t } = useTranslation()
  const say = useSay()
  const look = useLook()
  const member = view.member!
  const name = member.name || member.member_number || ''
  const door = size === 'door'
  return (
    <div className={door ? 'space-y-4' : 'space-y-3'}>
      <div className="space-y-2">
        {door
          ? <p className="font-a-display text-[clamp(1.75rem,min(6vw,7vh),3.25rem)] leading-tight text-a-text">{name}</p>
          : <Link to={memberPath(member.id)} className="block font-a-display text-3xl leading-tight text-a-text hover:underline">{name}</Link>}
        <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 text-a-text-2 ${door ? 'text-base' : 'text-sm'}`}>
          <TierChip tier={view.tier} theme={look.resolved} />
          {member.member_number && <span className="font-a-mono">{member.member_number}</span>}
          {view.validity && (
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={door ? 18 : 14} aria-hidden />{say(view.validity)}</span>
          )}
        </div>
      </div>
      {view.facts.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={t('loyalty.door.facts', 'Check-in')}>
          {view.facts.map(f => (
            <li key={f.key} className={`inline-flex items-center gap-1.5 rounded-full bg-a-surface-2 font-semibold text-a-text ${door ? 'px-4 py-2 text-lg' : 'px-3 py-1 text-sm'}`}>
              {f.key.endsWith('.points') ? <Sparkles size={door ? 18 : 14} aria-hidden /> : <Check size={door ? 18 : 14} aria-hidden />}
              {say(f)}
            </li>
          ))}
        </ul>
      )}
      {view.benefits.length > 0 && (
        <div className="space-y-1.5">
          <p className={`font-medium text-a-text-2 ${door ? 'text-sm' : 'text-xs'}`}>{t('loyalty.door.benefits', 'Benefits')}</p>
          <ul className="flex flex-wrap gap-2">
            {view.benefits.map(b => (
              <li key={b} className={`inline-flex items-center gap-1.5 rounded-full border border-a-border bg-a-surface text-a-text ${door ? 'px-3.5 py-1.5 text-base' : 'px-2.5 py-1 text-xs'}`}>
                <Gift size={door ? 16 : 12} aria-hidden className="text-a-accent-text" />{b}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/** The verdict filling door mode's screen: the tone's colour edge to edge, huge words, the member on a card beneath. */
export function DoorVerdict({ view, drain }: { view: VerdictView; drain: boolean }) {
  const say = useSay()
  const Icon = MARKS[view.mark]
  return (
    <div data-tone={view.tone} data-verdict={view.tone}
      className="l-verdict absolute inset-0 z-20 flex flex-col items-center justify-center gap-[clamp(1rem,3vh,2rem)] overflow-y-auto px-6 py-8 text-center animate-a-fade landscape:flex-row landscape:gap-10 landscape:text-left">
      <div className="flex flex-col items-center gap-[clamp(0.75rem,2.5vh,1.5rem)] landscape:max-w-[45%] landscape:items-start">
        <span className="l-verdict-disc grid h-[clamp(5rem,16vmin,10rem)] w-[clamp(5rem,16vmin,10rem)] place-items-center rounded-full">
          <Icon className="h-3/5 w-3/5" strokeWidth={2.75} aria-hidden />
        </span>
        <p className="font-a-display text-[clamp(2.5rem,min(9vw,11vh),6.5rem)] leading-none">{say(view.headline)}</p>
        {view.reason && <p className="max-w-3xl text-[clamp(1.25rem,min(4vw,5vh),2.5rem)] font-semibold leading-snug">{say(view.reason)}</p>}
      </div>
      {view.member && (
        <div className="w-full max-w-2xl rounded-3xl bg-a-surface p-5 text-left text-a-text shadow-a-lg sm:p-7 landscape:max-w-[50%]">
          <MemberFacts view={view} size="door" />
        </div>
      )}
      <div aria-hidden className="absolute inset-x-0 bottom-0 h-1.5">
        <div className={`l-verdict-bar h-full ${drain ? 'w-0 transition-[width] ease-linear motion-reduce:transition-none' : 'w-full'}`}
          style={drain ? { transitionDuration: `${CLEAR_AFTER_MS}ms` } : undefined} />
      </div>
    </div>
  )
}
