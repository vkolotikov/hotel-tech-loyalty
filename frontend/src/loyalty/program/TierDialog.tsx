import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { useLook } from '../lib/look'
import { useFirstFocus } from '../lib/useFirstFocus'
import { afterProgramChange, programApi } from './api'
import { ERRORS } from './errors'
import { FormField } from '../ui/formParts'
import { MAX_EARN_RATE, MAX_MIN_POINTS, MAX_MIN_SPEND, MAX_MIN_VISITS, floorField, TIER_FIELDS, examplePoints, isHex, tierBody, tierFormOf, tierProblems, type TierForm } from './programMath'
import { decimal, decimalOf, serverProblems } from '../lib/forms'
import { money, points } from '../lib/format'
import type { Tier } from './types'
import { TIER_PROBLEM_WORDS } from './words'
import { DesignDialog, NumberControl } from '../redesign/DesignUI'
import { useRedesignWords } from '../redesign/words'
import { OverviewButton } from '../overview/OverviewUI'
import { readableTierColor } from '../redesign/designMath'
import levelDiagonal from '../redesign/assets/level-diagonal.svg'

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
export function TierDialog({ tier, onClose, page = false, benefits, more, onDirty }: { tier: Tier | null; onClose: () => void; page?: boolean; benefits?: ReactNode; more?: ReactNode; onDirty?: (dirty: boolean) => void }) {
  const { t, i18n } = useTranslation()
  const say = useRedesignWords()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const by = boot.programme.progress_by ?? 'points'
  const look = useLook()
  const client = useQueryClient()
  const colourId = useId()
  const first = useFirstFocus<HTMLInputElement>()
  const [form, setForm] = useState<TierForm>(() => tierFormOf(tier))
  const [tried, setTried] = useState(false)
  const [original] = useState(() => JSON.stringify(tierFormOf(tier)))
  const dirty = JSON.stringify(form) !== original
  const [discard, setDiscard] = useState(false)
  const [destination, setDestination] = useState<string | null>(null)
  const navigate = useNavigate()
  const cancel = () => { if (dirty) setDiscard(true); else onClose() }
  useEffect(() => { onDirty?.(dirty) }, [dirty, onDirty])
  useEffect(() => { if (!dirty) return; const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }; window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn) }, [dirty])
  useEffect(() => {
    if (!page || !dirty) return
    const leaving = (e: MouseEvent) => {
      const link = e.target instanceof Element ? e.target.closest<HTMLAnchorElement>('a[href]') : null
      if (!link || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || link.target === '_blank' || link.hasAttribute('download')) return
      const url = new URL(link.href)
      if (url.origin !== window.location.origin || url.href === window.location.href) return
      e.preventDefault(); e.stopPropagation()
      setDestination(url.pathname + url.search + url.hash); setDiscard(true)
    }
    document.addEventListener('click', leaving, true)
    return () => document.removeEventListener('click', leaving, true)
  }, [dirty, page])

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


  const floor = floorField(by)
  const floorLabel = t(`loyalty.program.tier.${floor}`, by === 'visits' ? 'Visits to reach this tier' : by === 'spend' ? 'Spend to reach this tier' : 'Points to reach it')
  const floorValue = form[floor] ?? ''
  const title = tier ? say('editTitle', { name: tier.name }) : say('newTitle')
  const content = <form className="l-rd-level-form" noValidate onSubmit={e => { e.preventDefault(); setTried(true); if (!save.isPending && Object.keys(tierProblems(form, by)).length === 0) save.mutate() }}>
    <div className="l-rd-editor-columns">
      <div className="l-rd-editor-main">
        <section className="l-ov-panel l-rd-level-basics">
          <div className="l-rd-basics-row">
            <FormField label={say('levelName')} problem={problem('name')}><input ref={first} type="text" value={form.name} maxLength={255} onChange={e => update({ name: e.target.value })} className={INPUT} placeholder={t('loyalty.program.tier.name_example', 'e.g. Gold')} /></FormField>
            <div><span id={colourId} className="l-rd-label">{t('loyalty.program.tier.color', 'Colour')}</span><div className="l-rd-colour-input">
              <input type="color" value={isHex(form.color) ? form.color.trim().toLowerCase() : NO_COLOUR} onChange={e => update({ color: e.target.value })} aria-labelledby={colourId} />
              <input type="text" value={form.color} maxLength={7} onChange={e => update({ color: e.target.value })} spellCheck={false} aria-label={t('loyalty.program.tier.color_hex', 'Colour as a hex code')} aria-invalid={!!colourProblem} placeholder="#c9a227" />
            </div>{colourProblem && <p className="text-a-danger">{colourProblem}</p>}</div>
            <label><span className="l-rd-label">{say('status')}</span><select value={String(form.is_active)} onChange={e => update({ is_active: e.target.value === 'true' })}><option value="true">{say('active')}</option><option value="false">{say('off')}</option></select></label>
          </div>
          <FormField label={say('description')} problem={problem('description')}><textarea value={form.description} rows={1} onChange={e => update({ description: e.target.value })} className={INPUT} /></FormField>
        </section>
        <section className="l-ov-panel l-rd-qualification"><h2>{say('qualificationEarning')}</h2>
          <div className="l-rd-two-fields"><div><span className="l-rd-label">{floorLabel}</span><NumberControl label={floorLabel} value={floorValue} onValue={value => update({ [floor]: value })} max={by === 'visits' ? MAX_MIN_VISITS : by === 'spend' ? MAX_MIN_SPEND : MAX_MIN_POINTS} step={by === 'spend' ? .01 : 1} invalid={!!problem(floor)} disabled={save.isPending} />{problem(floor) && <p className="text-a-danger">{problem(floor)}</p>}</div>
          <div><span className="l-rd-label">{say('rate')}</span><NumberControl label={say('rate')} value={form.earn_rate} onValue={earn_rate => update({ earn_rate })} step={.01} max={MAX_EARN_RATE} invalid={!!problem('earn_rate')} disabled={save.isPending} />{problem('earn_rate') && <p className="text-a-danger">{problem('earn_rate')}</p>}{example !== null && <small className="l-rd-accent">{say('rateExample', { n: points(example, locale) })}</small>}</div></div>
          {by !== 'points' && <p data-measure={by}>{by === 'visits' ? t('loyalty.program.tier.min_visits_hint', 'One a day counts: appointments, stays, check-ins, purchases and events. Empty: no one moves up to it by visits.') : t('loyalty.program.tier.min_spend_hint', 'In {{currency}}, what members spent at their visits. Empty: no one moves up to it by spend.', { currency: boot.venue.currency })}</p>}
          <div className="l-rd-split-line"><small>{say('levelRules')}</small><Link className="l-ov-link" to="/loyalty/options?tab=rules">{say('qualificationRules')}</Link></div>
        </section>
        {benefits}
      </div>
      <aside className="l-rd-editor-aside">
        <section data-member-preview="" className="l-ov-panel l-rd-level-preview" aria-label={say('memberPreview')}><img src={levelDiagonal} alt="" /><span className="l-ov-eyebrow">{say('memberPreview')}</span>
          <h2 style={{ color: readableTierColor(form.color, look.resolved) }}>{form.name.trim() || t('loyalty.program.tier.preview', 'Preview')}</h2>
          {form.description && <p>{form.description}</p>}<hr />
          {floorValue !== '' && Number.isFinite(Number(floorValue)) && <small>{by === 'spend' ? money(Number(floorValue), boot.venue.currency, locale) : points(Number(floorValue), locale)} · {floorLabel}</small>}
          {rate !== null && <strong>{t('loyalty.program.tier.preview_rate', '×{{rate}} points on what they spend', { rate: decimal(rate, locale) })}</strong>}
          {tier?.benefits.length ? <ul>{tier.benefits.map(tb => <li key={tb.id}>✓ {tb.name}</li>)}</ul> : <p>{t('loyalty.program.tier.preview_no_benefits', 'No benefit yet: add them on the tier’s card in the ladder.')}</p>}
          <small>{say('previewUpdates')}</small>
        </section>
        <section className="l-ov-inset l-rd-before-save"><h3>{say('beforeSave')}</h3>{tier && <p>{say('membersInLevel', { n: points(tier.members, locale) })}</p>}<p>{say('beforeSaveLine')}</p><small>{say('offNote')}</small></section>
      </aside>
    </div>
    {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'tier', failure))}</Notice>}
    <footer className="l-rd-editor-footer"><small>{dirty ? say('unsaved') : ''}</small><OverviewButton type="button" onClick={cancel} disabled={save.isPending}>{t('loyalty.common.cancel', 'Cancel')}</OverviewButton><OverviewButton type="submit" primary disabled={save.isPending} aria-busy={save.isPending}>{say('saveLevel')}</OverviewButton></footer>
  </form>
  const keepEditing = () => { setDiscard(false); setDestination(null) }
  const warning = discard && <DesignDialog title={say('discardTitle')} onClose={keepEditing}><div className="l-rd-form"><p>{say('discardLine')}</p><div className="l-rd-form-foot"><OverviewButton onClick={keepEditing}>{say('keepEditing')}</OverviewButton><OverviewButton primary onClick={() => { if (destination) navigate(destination); else onClose() }}>{say('discard')}</OverviewButton></div></div></DesignDialog>
  return page ? <div className="l-ov-page l-rd-page"><button className="l-ov-link self-start" onClick={cancel}>{say('allLevelsBack')}</button><header className="l-ov-page-heading"><div><h1>{title}</h1><p>{say('editLine')}</p></div>{more}</header>{content}{warning}</div> : <DesignDialog title={title} wide onClose={cancel} busy={save.isPending}>{content}{warning}</DesignDialog>
}
