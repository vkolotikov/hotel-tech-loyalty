import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useLook } from '../lib/look'
import { useFirstFocus } from '../lib/useFirstFocus'
import { TierChip } from '../ui/TierChip'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import { Check, FormField, FormFoot, Toggle } from '../ui/formParts'
import { BOOST_FIELDS, MAX_MULTIPLIER, MIN_MULTIPLIER, WEEK, boostBody, boostFormOf, boostProblems, weekdayName, type BoostForm } from './programMath'
import { serverProblems, toggled, wallInput } from '../lib/forms'
import { BrandField } from '../rewards/parts'
import { brandPart, initialBrand } from '../rewards/rewardsMath'
import type { BrandOptions } from '../rewards/types'
import { needsTimeCheck } from './programMath'
import type { Boost, Tier } from './types'
import { BOOST_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'

/**
 * Add a boost event or change one (spec 2026-10-21 §4.5): a name, the multiplier, when it runs — on the venue's
 * clock, whatever the browser's zone (§6.6): the instants the server answers are shown as the venue's wall clock and
 * sent back as one —, on which weekdays and for which tiers (none chosen: every day, every tier), and whether it is on.
 * With more than one brand, a new boost names its brand (release 4) and a saved one can be moved (release 6). A boost
 * whose times were saved before they were read as the venue's (R4-6) says so above the times; saving it clears the
 * mark, and so does a manager's "These times are right" on Program (release 6).
 */
export function BoostDialog({ boost, tiers, brands, onClose }: { boost: Boost | null; tiers: Tier[]; brands?: BrandOptions; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const client = useQueryClient()
  const first = useFirstFocus<HTMLInputElement>()
  const daysId = useId()
  const tiersId = useId()
  const zone = boot.venue.timezone
  const [form, setForm] = useState<BoostForm>(() => boostFormOf(boost, zone, boot.venue.today))
  const [tried, setTried] = useState(false)
  const saved = boost ? (boost.brand_id ?? null) : undefined
  const [brand, setBrand] = useState<number | null>(() => initialBrand(brands, saved))

  const save = useMutation({
    mutationFn: () => (boost ? programApi.updateBoost(boost.id, { ...boostBody(form), ...brandPart(brand, saved) }) : programApi.createBoost({ ...boostBody(form), ...brandPart(brand) })),
    onSuccess: () => { afterProgramChange(client); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client) },
  })
  const update = (patch: Partial<BoostForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? boostProblems(form) : {}), ...serverProblems(failure?.fields, BOOST_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.program.boost.problem.${code}`, BOOST_PROBLEM_WORDS[code] ?? BOOST_PROBLEM_WORDS.name) : null
  }
  const clock = t('loyalty.program.boost.clock_hint', 'On the venue’s clock ({{zone}}).', { zone })
  const listProblem = problem('days_of_week') ?? problem('tier_ids')

  return (
    <Dialog title={boost ? t('loyalty.program.boost.edit_title', 'Change {{name}}', { name: boost.name }) : t('loyalty.program.boost.new_title', 'Add a boost')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(boostProblems(form)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.program.boost.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={120} onChange={(e) => update({ name: e.target.value })} className={INPUT}
            placeholder={t('loyalty.program.boost.name_example', 'e.g. Double points weekend')} />
        </FormField>

        <BrandField options={brands} value={brand} saved={saved}
          refused={!!failure?.fields?.brand} onChange={(id) => { setBrand(id); if (save.isError) save.reset() }} />

        <FormField label={t('loyalty.program.boost.multiplier', 'Multiplier')} problem={problem('multiplier')}
          hint={t('loyalty.program.boost.multiplier_hint', 'Points earned while it runs are multiplied by this, from 1 to 10.')}>
          <input type="number" inputMode="decimal" min={MIN_MULTIPLIER} max={MAX_MULTIPLIER} step={0.1} value={form.multiplier}
            onChange={(e) => update({ multiplier: e.target.value })} className={`${INPUT} sm:w-40`} />
        </FormField>

        {boost && needsTimeCheck(boost) && (
          <Notice tone="warning">{t('loyalty.program.time_check.dialog', 'Check these times: this boost was saved before boost times were read on the venue’s clock everywhere. If it was last saved in the full admin, its times may be off by the venue’s difference from UTC. Saving the boost marks them as checked.')}</Notice>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label={t('loyalty.program.boost.starts_at', 'Starts')} hint={clock} problem={problem('starts_at')}>
            <input type="datetime-local" value={form.starts_at} onChange={(e) => update({ starts_at: wallInput(e.target.value) })} className={INPUT} />
          </FormField>
          <FormField label={t('loyalty.program.boost.ends_at', 'Ends')} hint={clock} problem={problem('ends_at')}>
            <input type="datetime-local" value={form.ends_at} onChange={(e) => update({ ends_at: wallInput(e.target.value) })} className={INPUT} />
          </FormField>
        </div>

        <div role="group" aria-labelledby={daysId} className="space-y-1.5">
          <p id={daysId} className="text-xs font-medium text-a-text-2">{t('loyalty.program.boost.weekdays', 'Weekdays')}</p>
          <div className="flex flex-wrap gap-1.5">
            {WEEK.map(day => (
              <Toggle key={day} on={form.days.includes(day)} onClick={() => update({ days: toggled(form.days, day) })} label={weekdayName(day, locale, 'long')}>
                {weekdayName(day, locale)}
              </Toggle>
            ))}
          </div>
          <p className="text-xs text-a-text-2">{t('loyalty.program.boost.weekdays_hint', 'None chosen: every day.')}</p>
        </div>

        {tiers.length > 0 && (
          <div role="group" aria-labelledby={tiersId} className="space-y-1.5">
            <p id={tiersId} className="text-xs font-medium text-a-text-2">{t('loyalty.program.boost.tiers', 'Tiers')}</p>
            <div className="flex flex-wrap gap-1.5">
              {tiers.map(tier => (
                <Toggle key={tier.id} on={form.tiers.includes(tier.id)} onClick={() => update({ tiers: toggled(form.tiers, tier.id) })}>
                  <TierChip tier={tier} theme={look.resolved} size="sm" />
                </Toggle>
              ))}
            </div>
            <p className="text-xs text-a-text-2">{t('loyalty.program.boost.tiers_hint', 'None chosen: every tier.')}</p>
          </div>
        )}
        {listProblem && <p className="text-xs font-medium text-a-danger">{listProblem}</p>}

        <FormField label={t('loyalty.program.boost.description', 'Description')} problem={problem('description')}
          hint={t('loyalty.program.boost.description_hint', 'Optional, up to 500 characters.')}>
          <textarea value={form.description} rows={2} maxLength={500} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        <Check label={t('loyalty.program.boost.active', 'On')} checked={form.is_active} onChange={(on) => update({ is_active: on })}
          hint={t('loyalty.program.boost.active_hint', 'Switched off, the boost multiplies nothing, even between its dates.')} />

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'boost', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={boost ? t('loyalty.program.boost.save', 'Save boost') : t('loyalty.program.boost.create', 'Add boost')} />
      </form>
    </Dialog>
  )
}
