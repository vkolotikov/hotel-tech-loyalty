import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { toggled } from '../lib/forms'
import { useLook } from '../lib/look'
import { useFirstFocus } from '../lib/useFirstFocus'
import { Check, FormField, FormFoot, Toggle } from '../ui/formParts'
import { TierChip } from '../ui/TierChip'
import { ERRORS } from './errors'
import { MAX_DESCRIPTION, MAX_NAME, placeBody, placeFormOf, placeProblems, serverPlaceProblems, type PlaceForm } from './placesMath'
import { afterPlaceChange, placesApi, type Admits, type Place, type PlaceTier } from './placesApi'
import { PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add a place or change one (release 8, spec 2026-10-25 §1) — the three things that matter, in one short form: its
 * name, who may enter (every member, or the tiers ticked, each in its own colour), and whether it is switched on; a
 * description if wanted. A new place starts as "Every member", switched on. A press is sent with a key, so a retry after
 * a lost answer adds no second place; changing the form makes it a new press.
 */
export function PlaceDialog({ place, places, tiers, onClose, onRemove }: {
  place: Place | null
  places: Place[]
  tiers: PlaceTier[]
  onClose: () => void
  onRemove?: (place: Place) => void
}) {
  const { t } = useTranslation()
  const look = useLook()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const whoId = useId()
  const [form, setForm] = useState<PlaceForm>(() => placeFormOf(place))
  const [key, setKey] = useState(newPressKey)
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => (place ? placesApi.update(place.id, placeBody(form, key)) : placesApi.create(placeBody(form, key))),
    onSuccess: () => { afterPlaceChange(client); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterPlaceChange(client) },
  })
  const update = (patch: Partial<PlaceForm>) => {
    setForm(f => ({ ...f, ...patch }))
    setKey(newPressKey())
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? placeProblems(form, places, place?.id ?? null) : {}), ...serverPlaceProblems(failure) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.places.problem.${code}`, PROBLEM_WORDS[code] ?? PROBLEM_WORDS.name) : null
  }
  // A tier switched off since it was ticked stays on the place: it is shown, so it can be taken off.
  const offered = [...tiers, ...(place?.tiers ?? []).filter(pt => !tiers.some(x => x.id === pt.id))]
  const tiersProblem = problem('tier_ids')
  const choose = (admits: Admits) => update({ admits })

  return (
    <Dialog title={place ? t('loyalty.places.dialog.edit_title', 'Change {{name}}', { name: place.name }) : t('loyalty.places.dialog.new_title', 'Add a place')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(placeProblems(form, places, place?.id ?? null)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.places.dialog.name', 'Name')} problem={problem('name')}
          hint={t('loyalty.places.dialog.name_hint', 'What staff and members call it, such as Main entrance, VIP lounge or Spa.')}>
          <input ref={first} type="text" value={form.name} maxLength={MAX_NAME} onChange={(e) => update({ name: e.target.value })} className={INPUT}
            placeholder={t('loyalty.places.dialog.name_example', 'e.g. Main entrance')} />
        </FormField>

        <fieldset aria-describedby={tiersProblem ? `${whoId}-problem` : undefined} className="space-y-2">
          <legend className="mb-1 text-xs font-medium text-a-text-2">{t('loyalty.places.dialog.who', 'Who may enter')}</legend>
          <Choice name={whoId} checked={form.admits === 'all'} onChange={() => choose('all')}
            label={t('loyalty.places.dialog.every_member', 'Every member')}
            hint={t('loyalty.places.dialog.every_member_hint', 'Anyone whose membership is switched on and not expired.')} />
          <Choice name={whoId} checked={form.admits === 'tiers'} onChange={() => choose('tiers')}
            label={t('loyalty.places.dialog.only_tiers', 'Only these tiers')}
            hint={t('loyalty.places.dialog.only_tiers_hint', 'Members of the tiers you tick. Everyone else hears why not.')} />
          {form.admits === 'tiers' && (
            offered.length === 0
              ? <p className="pl-6 text-sm text-a-text-2">{t('loyalty.places.dialog.no_tiers', 'Your programme has no tiers in use yet. Add one under Tiers first.')}</p>
              : (
                <div role="group" aria-label={t('loyalty.places.dialog.tiers', 'Tiers that may enter')} className="flex flex-wrap gap-1.5 pl-6">
                  {offered.map(tier => (
                    <Toggle key={tier.id} on={form.tier_ids.includes(tier.id)} onClick={() => update({ tier_ids: toggled(form.tier_ids, tier.id) })}>
                      <TierChip tier={tier} theme={look.resolved} size="sm" />
                    </Toggle>
                  ))}
                </div>
              )
          )}
          {tiersProblem && <p id={`${whoId}-problem`} className="pl-6 text-xs font-medium text-a-danger">{tiersProblem}</p>}
        </fieldset>

        <FormField label={t('loyalty.places.dialog.description', 'Description')} problem={problem('description')}
          hint={t('loyalty.places.dialog.description_hint', 'Optional, up to 300 characters: opening hours, a dress code, what staff should know.')}>
          <textarea value={form.description} rows={2} maxLength={MAX_DESCRIPTION} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        <Check label={t('loyalty.places.dialog.active', 'Switched on')} checked={form.is_active} onChange={(on) => update({ is_active: on })}
          hint={t('loyalty.places.dialog.active_hint', 'Switched off, a scan here lets nobody in and the scan screen does not offer it.')} />

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.places', ERRORS, 'place', failure))}</Notice>}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          {place && onRemove
            ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => onRemove(place)} disabled={save.isPending}>
                <Trash2 size={14} aria-hidden />{t('loyalty.places.dialog.remove', 'Remove place')}
              </Button>
            )
            : <span />}
          <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
            save={place ? t('loyalty.places.dialog.save', 'Save place') : t('loyalty.places.dialog.create', 'Add place')} />
        </div>
      </form>
    </Dialog>
  )
}

/** One of the two answers to "who may enter": a radio with its label and the sentence under it. */
function Choice({ name, checked, onChange, label, hint }: { name: string; checked: boolean; onChange: () => void; label: string; hint: string }) {
  const id = useId()
  return (
    <div className="flex items-start gap-2.5">
      <input id={id} type="radio" name={name} checked={checked} onChange={onChange} aria-describedby={`${id}-hint`}
        className="mt-0.5 h-4 w-4 shrink-0 border-a-border accent-a-accent-text" />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm font-medium text-a-text">{label}</label>
        <p id={`${id}-hint`} className="text-xs text-a-text-2">{hint}</p>
      </div>
    </div>
  )
}
