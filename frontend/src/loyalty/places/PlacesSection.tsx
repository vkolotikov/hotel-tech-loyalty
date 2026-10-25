import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { MapPin, Pencil, Plus } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { SectionTitle } from '../../workspace/ui/Typography'
import type { ThemeName } from '../../workspace/theme/accent'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useLook } from '../lib/look'
import { activeTone } from '../program/programMath'
import { ConfirmDialog, ToneBadge } from '../ui/formParts'
import { TierChip } from '../ui/TierChip'
import { EntriesDialog } from './EntriesDialog'
import { ERRORS } from './errors'
import { PlaceDialog } from './PlaceDialog'
import { removedWords, todayWords, whoMayEnter, type Words } from './placesMath'
import { PLACES_KEY, afterPlaceChange, placesApi, type Place, type PlacesList } from './placesApi'

/** Which dialog is open, with the place it works on. */
type Open =
  | { kind: 'place'; place: Place | null }
  | { kind: 'remove'; place: Place }
  | { kind: 'entries'; place: Place }

/**
 * Release 8 (spec 2026-10-25 §1): Program's Places — where members scan in and which tiers may enter each, with today's
 * entries; a manager adds, changes and removes them (`manage`, and the server's `can_change`). Setting one up is a
 * name and a choice: every member, or the tiers ticked.
 */
export function PlacesSection({ manage }: { manage: boolean }) {
  const { t } = useTranslation()
  const look = useLook()
  const query = useQuery({ queryKey: PLACES_KEY, queryFn: placesApi.list })
  const [open, setOpen] = useState<Open | null>(null)
  const [said, setSaid] = useState<Words | null>(null)
  const close = () => setOpen(null)
  const data = query.data
  const change = manage && (data?.can_change ?? false)

  return (
    <section aria-labelledby="program-places" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle><span id="program-places">{t('loyalty.places.title', 'Places')}</span></SectionTitle>
        {change && (
          <Button size="sm" onClick={() => { setSaid(null); setOpen({ kind: 'place', place: null }) }}>
            <Plus size={15} aria-hidden />{t('loyalty.places.add', 'Add a place')}
          </Button>
        )}
      </div>
      <p className="text-sm text-a-text-2">{t('loyalty.places.line', 'Where members scan in, and which tiers may enter.')}</p>

      {said && <Notice tone="success">{t(...said)}</Notice>}
      <PlacesBody query={query} change={change} theme={look.resolved} onOpen={(next) => { setSaid(null); setOpen(next) }} />

      {data && open?.kind === 'place' && (
        <PlaceDialog place={open.place} places={data.places} tiers={data.tiers} onClose={close}
          onRemove={(place) => setOpen({ kind: 'remove', place })} />
      )}
      {open?.kind === 'remove' && (
        <RemovePlace place={open.place} onClose={close} onDone={(outcome) => { setSaid(removedWords(outcome, open.place.name)); close() }} />
      )}
      {open?.kind === 'entries' && <EntriesDialog place={open.place} onClose={close} />}
    </section>
  )
}

function PlacesBody({ query, change, theme, onOpen }: {
  query: { data?: PlacesList; isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown }
  change: boolean
  theme: ThemeName
  onOpen: (open: Open) => void
}) {
  const { t } = useTranslation()
  const data = query.data
  if (query.isError && !data) {
    return (
      <div className="max-w-xl space-y-3">
        <Notice tone="danger">{t(...refusalKey('loyalty.places', ERRORS, 'load', failureOf(query.error)))}</Notice>
        <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
      </div>
    )
  }
  if (!data) {
    return (
      <div role="status" className="grid gap-3 xl:grid-cols-2">
        <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
        <Skeleton className="h-32" />
      </div>
    )
  }
  if (data.places.length === 0) {
    return (
      <div data-places-empty="" className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-a-border px-4 py-6 text-center">
        <MapPin size={20} aria-hidden className="text-a-text-2" />
        <p className="max-w-md text-sm text-a-text-2">
          {change
            ? t('loyalty.places.none_manager', 'No places yet. Add your entrance first: scans there say who may come in.')
            : t('loyalty.places.none', 'No places yet. An owner or a manager adds them here.')}
        </p>
        {change && (
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: 'place', place: null })}>
            <Plus size={15} aria-hidden />{t('loyalty.places.add_first', 'Add the entrance')}
          </Button>
        )}
      </div>
    )
  }
  return (
    <ul aria-label={t('loyalty.places.list', 'Places')} className="grid gap-3 xl:grid-cols-2">
      {data.places.map(place => <PlaceCard key={place.id} place={place} change={change} theme={theme} onOpen={onOpen} />)}
    </ul>
  )
}

/** A place: its name, whether it is switched on, who may enter (every member, or the tiers' own chips), today's entries. */
export function PlaceCard({ place, change, theme, onOpen }: { place: Place; change: boolean; theme: ThemeName; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  const who = whoMayEnter(place)
  return (
    <li data-place={place.id} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <MapPin size={16} aria-hidden className="shrink-0 text-a-text-2" />
        <p className="min-w-0 truncate font-medium text-a-text">{place.name}</p>
        <ToneBadge tone={activeTone(place.is_active)}>
          {place.is_active ? t('loyalty.places.switched_on', 'Switched on') : t('loyalty.places.switched_off', 'Switched off')}
        </ToneBadge>
        {change && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpen({ kind: 'place', place })}>
            <Pencil size={14} aria-hidden />{t('loyalty.places.edit', 'Edit')}<span className="sr-only"> {place.name}</span>
          </Button>
        )}
      </div>

      {place.description && <p className="text-sm text-a-text-2">{place.description}</p>}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-a-text-2">{t('loyalty.places.who', 'Who may enter')}</p>
        {who.kind === 'every'
          ? <p className="text-sm text-a-text">{t('loyalty.places.every_member', 'Every member')}</p>
          : (
            <ul aria-label={t('loyalty.places.tiers_let_in', 'Tiers let in')} className="flex flex-wrap gap-1.5">
              {who.tiers.map(tier => <li key={tier.id}><TierChip tier={tier} theme={theme} size="sm" /></li>)}
            </ul>
          )}
      </div>

      <button type="button" onClick={() => onOpen({ kind: 'entries', place })}
        className="text-sm font-medium tabular-nums text-a-accent-text underline-offset-2 hover:underline">
        {t(...todayWords(place.today))}<span className="sr-only">: {t('loyalty.places.see_entries', 'see the entries at {{place}}', { place: place.name })}</span>
      </button>
    </li>
  )
}

/** Remove a place, once asked: one with a history is switched off instead, and the section says which happened. */
function RemovePlace({ place, onClose, onDone }: { place: Place; onClose: () => void; onDone: (outcome: 'deleted' | 'switched_off') => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => placesApi.remove(place.id),
    onSuccess: (answer) => { afterPlaceChange(client); onDone(answer.outcome) },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterPlaceChange(client) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog title={t('loyalty.places.remove.title', 'Remove {{name}}?', { name: place.name })}
      confirm={t('loyalty.places.remove.confirm', 'Remove place')} keep={t('loyalty.places.remove.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.places', ERRORS, 'remove', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.places.remove.body', 'Scans stop letting anyone in here. A place that already has entries, or that an event is held at, is switched off instead, so its history stays.')}</p>
    </ConfirmDialog>
  )
}
