import { useEditorClose } from '../editors/useEditorClose'
import { useId, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { EditorDialog, EditorSection, EditorDisclosure, EditorPreview, EditorArt, EditorFooter, EditorSwitch } from '../editors/EditorUI'
import { NumberControl } from '../redesign/DesignUI'
import { ManagementFact } from '../management/ManagementUI'
import { useAdminWords } from '../management/words'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useLook } from '../lib/look'
import { useFirstFocus } from '../lib/useFirstFocus'
import { TierChip } from '../ui/TierChip'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import { FormField, Toggle } from '../ui/formParts'
import { BOOST_FIELDS, MAX_MULTIPLIER, MIN_MULTIPLIER, WEEK, boostBody, boostFormOf, boostProblems, examplePoints, weekdayName, type BoostForm } from './programMath'
import { serverProblems, toggled, wallInput } from '../lib/forms'
import { points } from '../lib/format'
import { BrandField } from '../rewards/parts'
import { brandPart, initialBrand } from '../rewards/rewardsMath'
import type { BrandChoice, BrandOptions } from '../rewards/types'
import { needsTimeCheck } from './programMath'
import type { Boost, Tier } from './types'
import { BOOST_PROBLEM_WORDS } from './words'


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
  const [brand, setBrand] = useState<BrandChoice>(() => initialBrand(brands, saved))

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
  const close = useEditorClose({ form, brand }, onClose, save.isPending), admin = useAdminWords()
  const listProblem = problem('days_of_week') ?? problem('tier_ids')

  return <><EditorDialog area="options" title={boost ? t('loyalty.program.boost.edit_title', 'Change {{name}}', { name: boost.name }) : t('loyalty.program.boost.new_title', 'Add a boost')} section={admin('bonuses')} icon="boost" wide onClose={close.cancel} busy={save.isPending}>
    <form className="l-editor-form" noValidate onSubmit={e => { e.preventDefault(); setTried(true); if (!save.isPending && Object.keys(boostProblems(form)).length === 0) save.mutate() }}><div className="l-editor-body"><div className="l-editor-columns"><fieldset disabled={save.isPending} className="l-editor-stack">
      <div className="l-editor-two"><FormField label={t('loyalty.program.boost.name', 'Name')} problem={problem('name')}><input ref={first} type="text" value={form.name} maxLength={120} onChange={e => update({ name: e.target.value })} placeholder={t('loyalty.program.boost.name_example', 'e.g. Double points weekend')} /></FormField>
      <FormField label={t('loyalty.program.boost.multiplier', 'Multiplier')} problem={problem('multiplier')} hint={examplePoints(form.multiplier) !== null ? t('loyalty.program.boost.multiplier_example', 'From 1 to 10. While it runs, 100 points become {{n}}.', { n: points(examplePoints(form.multiplier) ?? 0, locale) }) : undefined}><NumberControl label={t('loyalty.program.boost.multiplier', 'Multiplier')} value={form.multiplier} min={MIN_MULTIPLIER} max={MAX_MULTIPLIER} step={.1} disabled={save.isPending} invalid={!!problem('multiplier')} onValue={multiplier => update({ multiplier })} /></FormField></div>
      {boost && needsTimeCheck(boost) && <Notice tone="warning">{t('loyalty.program.time_check.dialog', "Check these times: this boost was saved before boost times were read on the venue’s clock everywhere. If it was last saved in the full admin, its times may be off by the venue’s difference from UTC. Saving the boost marks them as checked.")}</Notice>}
      <EditorSection icon="clock" title={zone}><div className="l-editor-two"><FormField label={t('loyalty.program.boost.starts_at', 'Starts')} problem={problem('starts_at')}><input type="datetime-local" value={form.starts_at} onChange={e => update({ starts_at: wallInput(e.target.value) })} /></FormField><FormField label={t('loyalty.program.boost.ends_at', 'Ends')} problem={problem('ends_at')}><input type="datetime-local" value={form.ends_at} onChange={e => update({ ends_at: wallInput(e.target.value) })} /></FormField></div><small>{clock}</small></EditorSection>
      <div role="group" aria-labelledby={daysId} className="l-editor-stack"><p id={daysId}>{t('loyalty.program.boost.weekdays', 'Weekdays')}</p><div className="l-editor-choices">{WEEK.map(day => <Toggle key={day} on={form.days.includes(day)} onClick={() => update({ days: toggled(form.days, day) })} label={weekdayName(day, locale, 'long')}>{weekdayName(day, locale)}</Toggle>)}</div><small>{t('loyalty.program.boost.weekdays_hint', 'None chosen: every day.')}</small></div>
      {tiers.length > 0 && <div role="group" aria-labelledby={tiersId} className="l-editor-stack"><p id={tiersId}>{t('loyalty.program.boost.tiers', 'Tiers')}</p><div className="l-editor-choices">{tiers.map(tier => <Toggle key={tier.id} on={form.tiers.includes(tier.id)} onClick={() => update({ tiers: toggled(form.tiers, tier.id) })}><TierChip tier={tier} theme={look.resolved} size="sm" /></Toggle>)}</div><small>{t('loyalty.program.boost.tiers_hint', 'None chosen: every tier.')}</small></div>}
      {listProblem && <p role="alert" className="text-a-danger">{listProblem}</p>}
      <EditorSwitch label={t('loyalty.program.boost.active', 'On')} checked={form.is_active} onChange={is_active => update({ is_active })} hint={t('loyalty.program.boost.active_hint', 'Switched off, the boost multiplies nothing, even between its dates.')} />
      <EditorDisclosure title={admin('advanced')} open={!!problem('description') || !!failure?.fields?.brand}><BrandField options={brands} value={brand} saved={saved} refused={!!failure?.fields?.brand} onChange={id => { setBrand(id); if (save.isError) save.reset() }} /><FormField label={t('loyalty.program.boost.description', 'Description')} problem={problem('description')} hint={t('loyalty.program.boost.description_hint', 'Optional, up to 500 characters.')}><textarea value={form.description} rows={2} maxLength={500} onChange={e => update({ description: e.target.value })} /></FormField></EditorDisclosure>
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'boost', failure))}</Notice>}
    </fieldset><EditorPreview><EditorArt kind="earnArt" label={form.name || admin('automaticBoost')} title={examplePoints(form.multiplier) === null ? '—' : admin('pointsShort', { n: points(examplePoints(form.multiplier) ?? 0, locale) })} line={admin('basePointsShort', { n: 100 }) + ' × ' + form.multiplier} /><ManagementFact icon="bonusCalendar" label={admin('when')}>{form.starts_at} – {form.ends_at}<small>{zone}</small></ManagementFact><ManagementFact icon="people" label={admin('who')}>{form.tiers.length ? tiers.filter(tier => form.tiers.includes(tier.id)).map(tier => tier.name).join(', ') : t('loyalty.program.boosts.every_tier', 'Every tier')}</ManagementFact><small>{admin('highestWins')}</small></EditorPreview></div></div>
    <EditorFooter dirty={close.dirty} creating={!boost} onCancel={close.cancel} busy={save.isPending} save={boost ? t('loyalty.program.boost.save', 'Save boost') : t('loyalty.program.boost.create', 'Add boost')} /></form>
  </EditorDialog>{close.warning}</>
}
