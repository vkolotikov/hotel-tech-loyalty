import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Footprints, MapPin, Sparkles, Users } from 'lucide-react'
import type { ThemeName } from '../../workspace/theme/accent'
import { ToneBadge } from '../ui/formParts'
import { TierChip } from '../ui/TierChip'
import { counted, dateBlock, numbersLine, phaseTone, timeRange, whereOf, type Say } from './eventsMath'
import type { LoyaltyEventRow } from './types'
import { PHASE_WORDS } from './words'

/**
 * One event as a card (release 8, spec 2026-10-25 §4): the day as a date block, the title, the times and where, who may
 * come (the tiers as their coloured chips, or every member), what attending gives, the numbers ("12 signed up · 40
 * places left") and where it is in its life. The whole card opens the event's page.
 */
export function EventCard({ event, theme, locale }: { event: LoyaltyEventRow; theme: ThemeName; locale: string }) {
  const { t } = useTranslation()
  const say: Say = (key, fallback, vars) => t(key, fallback, vars ?? {})
  const block = dateBlock(event.starts_at, locale)
  const where = whereOf(event)
  const numbers = numbersLine(event, say, locale)
  const dim = event.phase === 'ended' || event.phase === 'cancelled'

  return (
    <li data-event={event.id}>
      <Link to={`/loyalty/events/${event.id}`}
        className="group flex items-stretch gap-4 rounded-2xl border border-a-border bg-a-surface p-4 shadow-a-sm transition-colors hover:border-a-accent-text/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-a-accent-text">
        <div aria-hidden className={`flex w-14 shrink-0 flex-col items-center justify-center rounded-xl py-2 ${dim ? 'bg-a-surface-2 text-a-text-2' : 'bg-a-accent/10 text-a-accent-text'}`}>
          <span className="text-xs font-semibold uppercase tracking-wide">{block.weekday}</span>
          <span className="font-a-display text-2xl leading-none">{block.day}</span>
          <span className="text-xs font-semibold uppercase tracking-wide">{block.month}</span>
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className={`min-w-0 font-medium text-a-text group-hover:text-a-accent-text ${event.phase === 'cancelled' ? 'line-through decoration-a-text-2/60' : ''}`}>{event.title}</p>
            <ToneBadge tone={phaseTone(event.phase)}>{t(`loyalty.events.phase.${event.phase}`, PHASE_WORDS[event.phase])}</ToneBadge>
          </div>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
            <span className="sr-only">{block.weekday} {block.day} {block.month}, </span>
            <span className="tabular-nums text-a-text">{timeRange(event.starts_at, event.ends_at, locale)}</span>
            {where && <span className="inline-flex min-w-0 items-center gap-1"><MapPin size={13} aria-hidden /><span className="truncate">{where}</span></span>}
          </p>
          <div className="flex flex-wrap items-center gap-1.5">
            {event.admits === 'tiers'
              ? event.tiers.map(tier => <TierChip key={tier.id} tier={tier} theme={theme} size="sm" />)
              : <span className="inline-flex items-center gap-1 text-xs text-a-text-2"><Users size={13} aria-hidden />{t('loyalty.events.card.every_member', 'Every member')}</span>}
            {event.points > 0 && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-a-accent-text"><Sparkles size={13} aria-hidden />{counted(say, 'points_plus', event.points, locale)}</span>
            )}
            {event.counts_as_visit && (
              <span className="inline-flex items-center gap-1 text-xs text-a-text-2"><Footprints size={13} aria-hidden />{t('loyalty.events.card.visit', 'Counts as a visit')}</span>
            )}
          </div>
          {numbers.length > 0 && <p className="text-xs font-medium text-a-text-2">{numbers.join(' · ')}</p>}
        </div>
      </Link>
    </li>
  )
}
