import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Check as Tick } from 'lucide-react'
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
import { Check, FormField, FormFoot } from '../ui/formParts'
import { MAX_EARN_RATE, MAX_MIN_POINTS, MAX_MIN_SPEND, MAX_MIN_VISITS, TIER_FIELDS, examplePoints, isHex, tierBody, tierFormOf, tierProblems, type TierForm } from './programMath'
import { decimal, decimalOf, serverProblems } from '../lib/forms'
import { points } from '../lib/format'
import type { Tier } from './types'
import { TIER_PROBLEM_WORDS } from './words'

const INPUT = 'w-full rounded-lg border border-a-border bg-a-surface px-3 py-2 text-sm text-a-text'
/** What the colour picker shows while the tier has no colour of its own. */
const NO_COLOUR = '#8a94a6'

/**
 * Add a tier or change one (spec 2026-10-21 §4.5): its name, colour — with the chip as members will see it —, what
 * reaches it, its earn rate, a description and whether it is in use. A new tier goes to the top of the ladder. The
 * bootstrap is read again after a save, since the shell and the members list draw tiers from it.
 *
 * Release 8 (spec 2026-10-25 §3): what reaches it is on the programme's measure — "Points to reach it", "Visits to
 * reach this tier" or "Spend to reach this tier" — and the other floors are hidden, kept as they are.
 *
 * Release 10 (the owner's Figma 163:166): the earn rate says what it does in figures as it is typed, and "What members
 * see" shows the tier as members meet it — its chip, its rate in words and the benefits it gives.
 */
export function TierDialog({ tier, onClose }: { tier: Tier | null; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const by = boot.programme.progress_by ?? 'points'
  const look = useLook()
  const client = useQueryClient()
  const colourId = useId()
  const first = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<TierForm>(() => tierFormOf(tier))
  const [tried, setTried] = useState(false)

  const save = useMutation({
    mutationFn: () => (tier ? programApi.updateTier(tier.id, tierBody(form)) : programApi.createTier(tierBody(form))),
    onSuccess: () => { afterProgramChange(client, { tiers: true }); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client, { tiers: true }) },
  })
  const update = (patch: Partial<TierForm>) => {
    setForm(f => ({ ...f, ...patch }))
    if (save.isError) save.reset()
  }

  const failure = save.isError ? failureOf(save.error) : null
  const problems = { ...(tried ? tierProblems(form, by) : {}), ...serverProblems(failure?.fields, TIER_FIELDS) }
  const problem = (field: string): string | null => {
    const code = problems[field]
    return code ? t(`loyalty.program.tier.problem.${code}`, TIER_PROBLEM_WORDS[code] ?? TIER_PROBLEM_WORDS.name) : null
  }
  const colourProblem = problem('color')
  const example = examplePoints(form.earn_rate)
  const rate = decimalOf(form.earn_rate)

  return (
    <Dialog title={tier ? t('loyalty.program.tier.edit_title', 'Change {{name}}', { name: tier.name }) : t('loyalty.program.tier.new_title', 'Add a tier')}
      onClose={onClose} busy={save.isPending}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        setTried(true)
        if (Object.keys(tierProblems(form, by)).length === 0) save.mutate()
      }}>
        <FormField label={t('loyalty.program.tier.name', 'Name')} problem={problem('name')}>
          <input ref={first} type="text" value={form.name} maxLength={255} onChange={(e) => update({ name: e.target.value })} className={INPUT}
            placeholder={t('loyalty.program.tier.name_example', 'e.g. Gold')} />
        </FormField>

        <div>
          <span id={colourId} className="mb-1 block text-xs font-medium text-a-text-2">{t('loyalty.program.tier.color', 'Colour')}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input type="color" value={isHex(form.color) ? form.color.trim().toLowerCase() : NO_COLOUR} onChange={(e) => update({ color: e.target.value })}
              aria-labelledby={colourId} className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-a-border bg-a-surface p-1" />
            <input type="text" value={form.color} maxLength={7} onChange={(e) => update({ color: e.target.value })} spellCheck={false}
              aria-label={t('loyalty.program.tier.color_hex', 'Colour as a hex code')} aria-invalid={colourProblem ? true : undefined}
              aria-describedby={colourProblem ? `${colourId}-problem` : undefined}
              placeholder="#c9a227" className={`${INPUT} w-32 font-a-mono`} />
            <span className="min-w-0" aria-hidden>
              <TierChip tier={{ name: form.name.trim() || t('loyalty.program.tier.preview', 'Preview'), color: isHex(form.color) ? form.color : null }} theme={look.resolved} />
            </span>
          </div>
          {colourProblem && <p id={`${colourId}-problem`} className="mt-1 text-xs font-medium text-a-danger">{colourProblem}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {by === 'points' && (
            <FormField label={t('loyalty.program.tier.min_points', 'Points to reach it')} problem={problem('min_points')}>
              <input type="number" inputMode="numeric" min={0} max={MAX_MIN_POINTS} step={1} value={form.min_points}
                onChange={(e) => update({ min_points: e.target.value })} className={INPUT} />
            </FormField>
          )}
          {by === 'visits' && (
            <FormField label={t('loyalty.program.tier.min_visits', 'Visits to reach this tier')} problem={problem('min_visits')}
              hint={t('loyalty.program.tier.min_visits_hint', 'One a day counts: appointments, stays, check-ins, purchases and events. Empty: no one moves up to it by visits.')}>
              <input type="number" inputMode="numeric" min={0} max={MAX_MIN_VISITS} step={1} value={form.min_visits ?? ''}
                onChange={(e) => update({ min_visits: e.target.value })} className={INPUT} />
            </FormField>
          )}
          {by === 'spend' && (
            <FormField label={t('loyalty.program.tier.min_spend', 'Spend to reach this tier')} problem={problem('min_spend')}
              hint={t('loyalty.program.tier.min_spend_hint', 'In {{currency}}, what members spent at their visits. Empty: no one moves up to it by spend.', { currency: boot.venue.currency })}>
              <input type="text" inputMode="decimal" max={MAX_MIN_SPEND} value={form.min_spend ?? ''}
                onChange={(e) => update({ min_spend: e.target.value })} className={INPUT} />
            </FormField>
          )}
          <FormField label={t('loyalty.program.tier.earn_rate', 'Earn rate')} problem={problem('earn_rate')}
            hint={example !== null
              ? t('loyalty.program.tier.earn_rate_example', 'Points per unit spent: 100 base points become {{n}} points.', { n: points(example, locale) })
              : t('loyalty.program.tier.earn_rate_hint', 'Points per unit spent; 1.5 earns half as much again.')}>
            <input type="number" inputMode="decimal" min={0} max={MAX_EARN_RATE} step={0.01} value={form.earn_rate}
              onChange={(e) => update({ earn_rate: e.target.value })} className={INPUT} />
          </FormField>
        </div>

        {by !== 'points' && (
          <p data-measure={by} className="text-sm text-a-text-2">
            {by === 'visits'
              ? t('loyalty.program.tier.measure_visits', 'Members move between tiers by their visits.')
              : t('loyalty.program.tier.measure_spend', 'Members move between tiers by what they spend.')}{' '}
            <Link to="/loyalty/options" className="font-medium text-a-accent-text hover:underline">{t('loyalty.program.tier.measure_change', 'Change it under Ways to earn')}</Link>
          </p>
        )}

        <FormField label={t('loyalty.program.tier.description', 'Description')} hint={t('loyalty.program.tier.description_hint', 'Optional. Members read it in the app.')}
          problem={problem('description')}>
          <textarea value={form.description} rows={3} onChange={(e) => update({ description: e.target.value })} className={INPUT} />
        </FormField>

        <Check label={t('loyalty.program.tier.active', 'In use')} checked={form.is_active} onChange={(on) => update({ is_active: on })}
          hint={t('loyalty.program.tier.active_hint', 'Switched off, no member moves into this tier.')} />

        <section data-member-preview="" data-hue="tier" aria-label={t('loyalty.program.tier.preview_title', 'What members see')} className="l-hue-panel space-y-2 rounded-xl border p-4">
          <p className="l-hue-text text-xs font-semibold uppercase tracking-wide">{t('loyalty.program.tier.preview_title', 'What members see')}</p>
          <TierChip tier={{ name: form.name.trim() || t('loyalty.program.tier.preview', 'Preview'), color: isHex(form.color) ? form.color : null }} theme={look.resolved} />
          {rate !== null && (
            <p className="text-sm font-medium text-a-text">{t('loyalty.program.tier.preview_rate', '×{{rate}} points on what they spend', { rate: decimal(rate, locale) })}</p>
          )}
          {tier && tier.benefits.length > 0
            ? (
              <ul className="space-y-1">
                {tier.benefits.map(tb => (
                  <li key={tb.id} className="flex items-center gap-2 text-sm text-a-text"><Tick size={14} aria-hidden className="l-hue-text shrink-0" />{tb.name}</li>
                ))}
              </ul>
            )
            : <p className="text-sm text-a-text-2">{t('loyalty.program.tier.preview_no_benefits', 'No benefit yet: add them on the tier’s card in the ladder.')}</p>}
        </section>

        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'tier', failure))}</Notice>}

        <FormFoot cancel={t('loyalty.common.cancel', 'Cancel')} busy={save.isPending} onCancel={onClose}
          save={tier ? t('loyalty.program.tier.save', 'Save tier') : t('loyalty.program.tier.create', 'Add tier')} />
      </form>
    </Dialog>
  )
}
