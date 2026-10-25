import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Check, ConciergeBell, DoorOpen, Maximize2, Settings2 } from 'lucide-react'
import { Skeleton } from '../../workspace/ui/Skeleton'
import type { EventRow, PlaceRow } from './scanApi'
import { doorPath, eventHours, sameContext, type Resolved, type ScanContext } from './scanContext'

export interface Choices {
  /** The places switched on (undefined: not loaded yet, or could not be). */
  places: PlaceRow[] | undefined
  /** Today's events open now or later (undefined: not loaded yet, or could not be). */
  events: EventRow[] | undefined
  loading: boolean
  failed: boolean
  /** A manager, who may add places: "Set up places" is offered when there are none. */
  canSetUp: boolean
}

/**
 * "Scanning for" (spec 2026-10-25 §2): the desk, each place switched on, each event open now or later today — one tap
 * each, grouped, the chosen one pressed; a line saying what a scan does there, and Door mode for a place or an event.
 */
export function ContextPicker({ resolved, choices, onChoose }: { resolved: Resolved; choices: Choices; onChoose: (context: ScanContext) => void }) {
  const { t } = useTranslation()
  const context = resolved.context
  const places = choices.places ?? []
  const events = choices.events ?? []
  const on = (c: ScanContext) => sameContext(context, c)

  return (
    <section aria-labelledby="scan-for" className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="scan-for" className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('loyalty.door.scanning_for', 'Scanning for')}</h2>
        {context.kind !== 'desk' && (
          <Link to={doorPath(context)} className="ml-auto inline-flex items-center gap-2 rounded-full sm:hidden border border-a-border bg-a-surface px-4 py-2 text-sm font-semibold text-a-text hover:bg-a-surface-2">
            <Maximize2 size={15} aria-hidden />{t('loyalty.door.open_door', 'Door mode')}
          </Link>
        )}
      </div>

      <div className="space-y-3">
        <div role="group" aria-labelledby="scan-for" className="flex flex-wrap gap-2">
          <Choice on={on({ kind: 'desk' })} onClick={() => onChoose({ kind: 'desk' })} icon={<ConciergeBell size={16} aria-hidden />}>
            {t('loyalty.door.desk', 'Desk')}
          </Choice>
        </div>
        {places.length > 0 && (
          <Group label={t('loyalty.door.places', 'Places')}>
            {places.map(p => (
              <Choice key={`p${p.id}`} on={on({ kind: 'place', id: p.id })} onClick={() => onChoose({ kind: 'place', id: p.id })} icon={<DoorOpen size={16} aria-hidden />}>
                {p.name}
              </Choice>
            ))}
          </Group>
        )}
        {events.length > 0 && (
          <Group label={t('loyalty.door.events_today', 'Events today')}>
            {events.map(e => (
              <Choice key={`e${e.id}`} on={on({ kind: 'event', id: e.id })} onClick={() => onChoose({ kind: 'event', id: e.id })} icon={<CalendarDays size={16} aria-hidden />}>
                <span>{e.title}</span><span className="font-a-mono text-xs opacity-80">{eventHours(e)}</span>
              </Choice>
            ))}
          </Group>
        )}
        {choices.loading && (
          <div className="flex gap-2" role="status">
            <span className="sr-only">{t('loyalty.door.loading_places', 'Loading places and events…')}</span>
            <Skeleton className="h-11 w-36 rounded-full" /><Skeleton className="h-11 w-28 rounded-full" />
          </div>
        )}
      </div>

      {choices.failed && <p className="text-sm text-a-text-2">{t('loyalty.door.places_failed', 'Places and events could not be loaded. The desk works as usual; they appear when the connection is back.')}</p>}
      {!choices.loading && !choices.failed && places.length === 0 && choices.canSetUp && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
          <span>{t('loyalty.door.no_places', 'Add your entrances and rooms to check who may enter as you scan.')}</span>
          <Link to="/loyalty/program#places" className="inline-flex items-center gap-1.5 font-semibold text-a-accent-text hover:underline">
            <Settings2 size={14} aria-hidden />{t('loyalty.door.set_up_places', 'Set up places')}
          </Link>
        </p>
      )}
      <ContextLine resolved={resolved} />
    </section>
  )
}

/** What a scan does in the chosen context, in a sentence. */
function ContextLine({ resolved }: { resolved: Resolved }) {
  const { t } = useTranslation()
  const line = resolved.pending ? t('loyalty.door.loading_places', 'Loading places and events…')
    : resolved.place ? t('loyalty.door.line_place', 'Each scan decides whether the member may enter {{place}}, and records it.', { place: resolved.place.name })
    : resolved.event ? t('loyalty.door.line_event', 'Each scan checks the member in to {{event}} ({{hours}}).', { event: resolved.event.title, hours: eventHours(resolved.event) })
    : t('loyalty.door.line_desk', 'Find a member, then award or redeem points or check them in.')
  return <p data-context-line="" className="text-sm text-a-text">{line}</p>
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1.5">
      <p aria-hidden className="text-xs font-medium text-a-text-2">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

/** One context to scan for: a real button that says whether it is the chosen one. */
function Choice({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${on
        ? 'border-a-accent-text bg-a-accent/10 text-a-text shadow-a-sm'
        : 'border-a-border bg-a-surface text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
      {on ? <Check size={16} aria-hidden className="text-a-accent-text" /> : icon}
      {children}
    </button>
  )
}
