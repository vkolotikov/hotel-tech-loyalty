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
 * "Scanning for" (spec 2026-10-25 §2; release 9 made it one row): the desk, each place switched on, each event open now
 * or later today — one tap each, the chosen one pressed. The icon says which kind it is (bell, door, calendar), so the
 * groups need no headings on screen (they keep theirs for a screen reader); Door mode for a place or an event.
 */
export function ContextPicker({ resolved, choices, onChoose }: { resolved: Resolved; choices: Choices; onChoose: (context: ScanContext) => void }) {
  const { t } = useTranslation()
  const context = resolved.context
  const places = choices.places ?? []
  const events = choices.events ?? []
  const on = (c: ScanContext) => sameContext(context, c)

  return (
    <section aria-labelledby="scan-for" className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="scan-for" className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('loyalty.door.scanning_for', 'Scanning for')}</h2>
        {context.kind !== 'desk' && (
          <Link to={doorPath(context)} className="ml-auto inline-flex items-center gap-1.5 rounded-full sm:hidden border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
            <Maximize2 size={14} aria-hidden />{t('loyalty.door.open_door', 'Door mode')}
          </Link>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Choice on={on({ kind: 'desk' })} onClick={() => onChoose({ kind: 'desk' })} icon={<ConciergeBell size={16} aria-hidden />}>
          {t('loyalty.door.desk', 'Desk')}
        </Choice>
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
          <span className="contents" role="status">
            <span className="sr-only">{t('loyalty.door.loading_places', 'Loading places and events…')}</span>
            <Skeleton className="h-11 w-36 rounded-full" /><Skeleton className="h-11 w-28 rounded-full" />
          </span>
        )}
      </div>

      {choices.failed && <p className="text-sm text-a-text-2">{t('loyalty.door.places_failed', 'Places and events could not be loaded. The desk works as usual; they appear when the connection is back.')}</p>}
      {!choices.loading && !choices.failed && places.length === 0 && choices.canSetUp && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-a-text-2">
          <span>{t('loyalty.door.no_places', 'Add your entrances and rooms to check who may enter as you scan.')}</span>
          <Link to="/loyalty/program?tab=places" className="inline-flex items-center gap-1.5 font-semibold text-a-accent-text hover:underline">
            <Settings2 size={14} aria-hidden />{t('loyalty.door.set_up_places', 'Set up places')}
          </Link>
        </p>
      )}
    </section>
  )
}

/** A group of choices in the row: no heading on screen (the icons say the kind), its name for a screen reader. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return <span role="group" aria-label={label} className="contents">{children}</span>
}

/** One context to scan for: a real button that says whether it is the chosen one. */
function Choice({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon: ReactNode; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${on
        ? 'border-transparent bg-a-accent text-a-accent-ink shadow-a-sm'
        : 'border-a-border bg-a-surface text-a-text-2 hover:bg-a-surface-2 hover:text-a-text'}`}>
      {on ? <Check size={16} aria-hidden /> : icon}
      {children}
    </button>
  )
}
