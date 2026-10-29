import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Briefcase, Building2, Check, ChevronLeft, ChevronRight, Dumbbell, GraduationCap, House, ShoppingBag, Sparkles, Star, Stethoscope,
  Ticket, Users, Utensils, type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { SectionTitle } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, newPressKey } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { points } from '../lib/format'
import { named } from '../lib/forms'
import { ERRORS } from './errors'
import { OPTIONS_KEY, afterOptionsChange, optionsApi } from './optionsApi'
import {
  KEEP, STEPS, alwaysOn, configurable, formProblems, keepsTiers, presetOf, recommendedForm, reviewOf, sentenceOf, serverProblems, setupBody,
  startChoice, stepAfter, waysWith, previewOptions, type OptionsForm, type Problems, type Step,
} from './optionsMath'
import { LoadFailed, Loading, Sentence, WayFields, WayIcon } from './parts'
import { useSay, wayLine, wayTitle } from './say'
import type { OptionsAnswer, Preset, SetupOutcome } from './types'
import { PRESET_LINE_WORDS, PRESET_WORDS, STEP_WORDS } from './words'
import { useSettingsWords } from '../settings/words'
import { OverviewButton, OverviewDialog } from '../overview/OverviewUI'
import { useLeaveGuard } from '../earn/useLeaveGuard'
import './setup.css'

/** The server's icon name for a preset (LoyaltyPresetService::PRESETS `icon`); one the workspace does not know wears the area's own. */
const PRESET_ICONS: Record<string, LucideIcon> = {
  'building-2': Building2, sparkles: Sparkles, utensils: Utensils, dumbbell: Dumbbell, stethoscope: Stethoscope, star: Star,
  'graduation-cap': GraduationCap, briefcase: Briefcase, home: House, 'shopping-bag': ShoppingBag,
  // Release 8: the general memberships.
  users: Users, ticket: Ticket,
}

/**
 * The setup wizard (release 7, spec 2026-10-25 §1), at /loyalty/options/setup: 1. your business — a starting programme,
 * the industry's own first (a venue that already has tiers keeps them and its rewards); 2. choose — every way to earn,
 * ticked as the starting point suggests (or as the venue uses them today); 3. configure — the ticked ways' numbers;
 * 4. review — what members will get, in sentences, then Apply. Skip at any step. A manager's; anyone else reads why.
 */
export function SetupWizard() {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options })
  const data = query.data

  return (
    <div className="l-ov-page l-rd-page l-gs-page">
      <header className="l-ov-page-heading"><div><h1>{t('loyalty.redesign.guidedSetup', 'Guided setup')}</h1><p>{t('loyalty.options.wizard.line', 'Four short steps. You can change everything later under Ways to earn.')}</p></div><Link to="/loyalty/guide" className="l-ov-button">{t('loyalty.guide.page.title', 'Guide')}</Link></header>
      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}
      {data && !data.can_change && (
        <div className="max-w-xl space-y-3">
          <Notice>{t('loyalty.options.wizard.managers_only', 'Only an owner or a manager can set up the programme.')}</Notice>
          <Link to="/loyalty/options" className="inline-flex text-sm font-semibold text-a-accent-text hover:underline">{t('loyalty.options.wizard.to_options', 'Go to Ways to earn')}</Link>
        </div>
      )}
      {data?.can_change && <Wizard answer={data} />}
    </div>
  )
}

/** Where the wizard starts (the tests open a later step directly). */
export interface WizardStart {
  step?: Step
  choice?: string
  form?: OptionsForm
  done?: SetupOutcome
}

export function Wizard({ answer, start = {} }: { answer: OptionsAnswer; start?: WizardStart }) {
  const { t, i18n } = useTranslation()
  const say = useSay()
  const design = useSettingsWords()
  const guard = useLeaveGuard()
  const locale = i18n.language || 'en'
  const currency = useBoot().venue.currency
  const client = useQueryClient()
  const navigate = useNavigate()
  const keep = keepsTiers(answer)

  const [step, setStep] = useState<Step>(start.step ?? 'business')
  const [choice, setChoice] = useState(start.choice ?? startChoice(answer))
  const [form, setForm] = useState<OptionsForm>(() => start.form ?? recommendedForm(answer, presetOf(answer, start.choice ?? startChoice(answer)), answer.options))
  const [tried, setTried] = useState(false)
  // One key per visit to Review: a retry of the same Apply writes nothing new; a changed setup is a new press.
  const [key, setKey] = useState(() => newPressKey())
  const [done, setDone] = useState<SetupOutcome | null>(start.done ?? null)
  const [asking, setAsking] = useState(false)

  const apply = useMutation({
    mutationFn: () => optionsApi.setup(setupBody(answer, choice, form, key)),
    onSuccess: (next) => { afterOptionsChange(client, next, next.setup.preset_applied); setDone(next.setup) },
    onSettled: guard.end,
  })
  const skip = useMutation({
    mutationFn: optionsApi.skip,
    onSuccess: (next) => { afterOptionsChange(client, next); navigate('/loyalty/options') },
    onSettled: guard.end,
  })

  const changed = !done && (step !== 'business' || choice !== startChoice(answer) || JSON.stringify(form) !== JSON.stringify(recommendedForm(answer, presetOf(answer, startChoice(answer)), answer.options)))
  const { mark } = guard
  useEffect(() => { mark('setup', changed) }, [changed, mark])

  const heading = useRef<HTMLHeadingElement>(null)
  const first = useRef(true)
  useEffect(() => {
    // A new step is read from its title, as a new page would be; not on arrival.
    if (first.current) { first.current = false; return }
    heading.current?.focus()
  }, [step, done])

  const rewards = answer.catalogue.rewards
  const ctx = { say, currency, locale, rewards }
  const local = formProblems(answer, form, rewards)
  const applyFailure = apply.isError ? failureOf(apply.error) : null
  const problems: Problems = { ...serverProblems(applyFailure, answer), ...(tried ? local : {}) }

  const choose = (next: string) => {
    if (keep || next === choice) return
    setChoice(next)
    setForm(recommendedForm(answer, presetOf(answer, next), answer.options))
  }
  const go = (next: Step) => {
    if (next === step) return
    if (next === 'review') { setKey(newPressKey()); apply.reset() }
    setStep(next)
  }
  const onNext = (e: FormEvent) => {
    e.preventDefault()
    if (step === 'configure' && Object.keys(local).length > 0) { setTried(true); return }
    if (step === 'review') { if (guard.begin()) apply.mutate(); return }
    const next = stepAfter(step, 1)
    if (next) go(next)
  }
  const back = () => { const previous = stepAfter(step, -1); if (previous) go(previous) }
  const index = STEPS.indexOf(step)

  if (done) return <Done outcome={done} headingRef={heading} />

  return (
    <div className="l-gs-workspace">
      <section className="l-ov-panel l-gs-progress"><div><h2>{design('draftTitle')}</h2><span>{t('loyalty.options.wizard.step_of', 'Step {{n}} of {{total}}', { n: String(index + 1), total: String(STEPS.length) })}</span></div><p>{design('draftLine')}</p><progress max={STEPS.length} value={index} aria-label={t('loyalty.options.wizard.steps', 'Steps')} /></section>
      <div className="l-gs-columns"><div className="l-gs-main">
      <div className="l-ov-panel l-gs-steps">
        <ol aria-label={t('loyalty.options.wizard.steps', 'Steps')}>
          {STEPS.map((s, i) => (
            <li key={s} data-step={s} aria-current={s === step ? 'step' : undefined}
              data-complete={i < index || undefined}>
              <button type="button" disabled={i > index || apply.isPending} onClick={() => go(s)}>
              <span aria-hidden className="font-a-mono text-xs tabular-nums">{i < index ? <Check size={13} /> : i + 1}</span>
              {t(`loyalty.options.step.${s}`, STEP_WORDS[s])}
              </button>
            </li>
          ))}
        </ol>
        <OverviewButton type="button" disabled={apply.isPending} onClick={() => setAsking(true)}>{t('loyalty.options.wizard.skip', 'Skip setup')}</OverviewButton>
      </div>

      <form noValidate onSubmit={onNext} aria-labelledby="wizard-step" className="l-ov-panel l-gs-form">
        <div className="space-y-1">
          <p className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">
            {t('loyalty.options.wizard.step_of', 'Step {{n}} of {{total}}', { n: String(index + 1), total: String(STEPS.length) })}
          </p>
          <h2 id="wizard-step" ref={heading} tabIndex={-1} className="font-a-display text-2xl font-normal leading-snug text-a-text outline-none">
            {stepTitle(t, step)}
          </h2>
        </div>

        {step === 'business' && <Business answer={answer} choice={choice} keep={keep} onChoose={choose} />}
        {step === 'choose' && <Choose answer={answer} form={form} keep={keep} choice={choice} ctx={ctx} onChange={setForm} />}
        {step === 'configure' && (
          <Configure answer={answer} form={form} problems={problems} ctx={ctx} onChange={(way, key, value) => {
            setForm({ ...form, [way]: { ...form[way], values: { ...form[way].values, [key]: value } } })
            apply.reset()
          }} />
        )}
        {step === 'review' && <Review answer={answer} form={form} choice={choice} keep={keep} ctx={ctx} />}

        {step === 'review' && applyFailure && (
          <div className="space-y-2">
            <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'setup', applyFailure))}</Notice>
            {waysWith(problems, answer).length > 0 && (
              <Button type="button" variant="secondary" size="sm" onClick={() => { setTried(true); go('configure') }}>{t('loyalty.options.wizard.to_configure', 'Back to Configure')}</Button>
            )}
          </div>
        )}
        {step === 'configure' && tried && Object.keys(local).length > 0 && (
          <Notice tone="danger">{t('loyalty.options.wizard.fix_fields', 'Check the fields marked below.')}</Notice>
        )}

        <div className="l-gs-actions">
          {index > 0
            ? <Button type="button" variant="secondary" onClick={back} disabled={apply.isPending}><ChevronLeft size={15} aria-hidden />{t('loyalty.options.wizard.back', 'Back')}</Button>
            : <span />}
          {step === 'review'
            ? <Button type="submit" loading={apply.isPending}>{t('loyalty.options.wizard.apply', 'Apply')}</Button>
            : <Button type="submit">{t('loyalty.options.wizard.next', 'Next')}<ChevronRight size={15} aria-hidden /></Button>}
        </div>
      </form>
      <section className="l-ov-panel l-gs-optional"><h3>{design('optional')}</h3><div><Link className="l-ov-link" to="/loyalty/program?tab=places">{t('loyalty.places.title', 'Places')} →</Link><Link className="l-ov-link" to="/loyalty/program?tab=boosts">{t('loyalty.program.boosts.title', 'Boost events')} →</Link><Link className="l-ov-link" to="/loyalty/options">{t('loyalty.nav.options', 'Ways to earn')} →</Link></div></section>
      </div>
      {step !== 'review' && <aside className="l-ov-panel l-gs-preview"><small>{design('preview')}</small><h2>{t('loyalty.options.wizard.review_title', 'What members will get')}</h2><div tabIndex={0} role="region" aria-label={design('preview')}><ul>{reviewOf(answer, form, answer.options, ctx).on.map(line => <li key={line.key}><strong>{wayTitle(ctx.say, line.key)}</strong><p>{line.text}</p></li>)}</ul></div><p>{design('previewHint')}</p></aside>}
      </div>

      {asking && (
        <OverviewDialog kind="form" className="l-gs-dialog" title={t('loyalty.options.wizard.skip_title', 'Skip the setup?')} onClose={() => setAsking(false)} busy={skip.isPending}>
          <div className="space-y-4">
            <p className="text-sm text-a-text">
              {t('loyalty.options.wizard.skip_body', 'Nothing you chose here is saved, and the programme stays as it is. You can open the setup again any time from Ways to earn.')}
            </p>
            {skip.isError && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'skip', failureOf(skip.error)))}</Notice>}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <OverviewButton type="button" disabled={skip.isPending} onClick={() => setAsking(false)}>{t('loyalty.options.wizard.skip_keep', 'Keep going')}</OverviewButton>
              <OverviewButton primary type="button" disabled={skip.isPending} aria-busy={skip.isPending} onClick={() => { if (guard.begin()) skip.mutate() }}>{t('loyalty.options.wizard.skip_confirm', 'Skip setup')}</OverviewButton>
            </div>
          </div>
        </OverviewDialog>
      )}
      {guard.destination && <OverviewDialog kind="form" className="l-gs-dialog" title={design('leaveTitle')} onClose={guard.keep}><p>{t('loyalty.options.wizard.skip_body', 'Nothing you chose here is saved, and the programme stays as it is. You can open the setup again any time from Ways to earn.')}</p><div className="l-gs-dialog-actions"><OverviewButton onClick={guard.keep}>{design('keepEditing')}</OverviewButton><OverviewButton primary onClick={guard.discard}>{design('discard')}</OverviewButton></div></OverviewDialog>}
    </div>
  )
}

type T = ReturnType<typeof useTranslation>['t']
type Ctx = Parameters<typeof sentenceOf>[2]

function stepTitle(t: T, step: Step): string {
  switch (step) {
    case 'business': return t('loyalty.options.wizard.business_title', 'What kind of business is this?')
    case 'choose': return t('loyalty.options.wizard.choose_title', 'How should members earn and be rewarded?')
    case 'configure': return t('loyalty.options.wizard.configure_title', 'Set the numbers')
    default: return t('loyalty.options.wizard.review_title', 'What members will get')
  }
}

function presetName(t: T, p: Preset): string {
  const word = named('loyalty.options.preset', PRESET_WORDS, p.key)
  return word ? t(...word) : p.label
}

function presetLine(t: T, p: Preset): string {
  const word = named('loyalty.options.preset_line', PRESET_LINE_WORDS, p.key)
  return word ? t(...word) : p.description
}

// ─── 1. Your business ─────────────────────────────────────────────────────

/**
 * The starting programmes as large choices (real radio buttons: the arrow keys move between them), the industry's own
 * first and marked. A venue with tiers sees "Keep my tiers and rewards" chosen and the presets greyed, with why.
 */
export function Business({ answer, choice, keep, onChoose }: { answer: OptionsAnswer; choice: string; keep: boolean; onChoose: (key: string) => void }) {
  const { t } = useTranslation()
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm text-a-text-2">
        {keep
          ? t('loyalty.options.wizard.business_keep_line', 'Your programme already has tiers, so it keeps them and its rewards. The next steps choose the ways to earn that go with them.')
          : t('loyalty.options.wizard.business_line', 'Choose the closest. It sets up tiers and a first rewards catalogue, which you can change later.')}
      </legend>
      {keep && (
        <ChoiceCard name="programme-start" value={KEEP} checked onChoose={onChoose} icon={Check}
          title={t('loyalty.options.wizard.keep', 'Keep my tiers and rewards')}
          line={t('loyalty.options.wizard.keep_line', 'Tiers: {{tiers}}. Rewards in the catalogue: {{rewards}}. Nothing in them changes.', { tiers: String(answer.catalogue.tiers), rewards: String(answer.catalogue.rewards.length) })} />
      )}
      <details className="l-gs-presets" open={keep ? undefined : true}>
      <summary hidden={!keep}>{t('loyalty.options.wizard.presets_greyed', 'Starting programmes set up a new venue’s tiers only. They are shown here for reference.')}</summary>
      <div className="grid gap-3 sm:grid-cols-2">
        {answer.presets.map(p => (
          <ChoiceCard key={p.key} name="programme-start" value={p.key} checked={!keep && choice === p.key} disabled={keep} onChoose={onChoose}
            icon={PRESET_ICONS[p.icon] ?? Sparkles} title={presetName(t, p)} line={presetLine(t, p)}
            badge={p.recommended ? t('loyalty.options.wizard.suggested', 'Suggested for your business') : null}
            detail={[
              t('loyalty.options.wizard.preset_tiers', 'Tiers: {{names}}', { names: p.tier_names.join(', ') }),
              ...(p.sample_rewards.length > 0 ? [t('loyalty.options.wizard.preset_rewards', 'Rewards such as {{names}}', { names: p.sample_rewards.join(', ') })] : []),
            ]} />
        ))}
      </div>
      </details>
    </fieldset>
  )
}

function ChoiceCard({ name, value, checked, disabled = false, onChoose, icon: Icon, title, line, badge = null, detail = [] }: {
  name: string
  value: string
  checked: boolean
  disabled?: boolean
  onChoose: (value: string) => void
  icon: LucideIcon
  title: string
  line: string
  badge?: string | null
  detail?: string[]
}) {
  return (
    <label data-choice={value} data-checked={checked ? '' : undefined}
      className={`relative flex gap-3 rounded-2xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-accent-text ${checked ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border bg-a-surface'} ${disabled ? 'cursor-not-allowed opacity-55' : 'cursor-pointer hover:bg-a-surface-2'}`}>
      <input type="radio" name={name} value={value} checked={checked} disabled={disabled} onChange={() => onChoose(value)} className="sr-only" />
      <span aria-hidden className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${checked ? 'bg-a-accent text-a-accent-ink' : 'bg-a-surface-2 text-a-text-2'}`}>
        <Icon size={20} />
      </span>
      <span className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-a-text">{title}</span>
          {badge && <span className="rounded-full bg-a-accent/15 px-2 py-0.5 text-xs font-semibold text-a-accent-text">{badge}</span>}
        </span>
        <span className="block text-sm text-a-text-2">{line}</span>
        {detail.map(d => <span key={d} className="block text-xs text-a-text-2">{d}</span>)}
      </span>
    </label>
  )
}

// ─── 2. Choose ────────────────────────────────────────────────────────────

/** Every way to earn as a tick card, pre-ticked from the starting point; a ticked one says what members get. */
export function Choose({ answer, form, keep, choice, ctx, onChange }: {
  answer: OptionsAnswer
  form: OptionsForm
  keep: boolean
  choice: string
  ctx: Ctx
  onChange: (form: OptionsForm) => void
}) {
  const { t } = useTranslation()
  const preset = presetOf(answer, choice)
  return (
    <fieldset className="space-y-4">
      <legend className="text-sm text-a-text-2">
        {keep || !preset
          ? t('loyalty.options.wizard.choose_keep_line', 'Ticked: what your programme uses today. Tick what you want members to have.')
          : t('loyalty.options.wizard.choose_line', 'Ticked: what we suggest for {{preset}}. Tick what you want members to have.', { preset: presetName(t, preset) })}
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {answer.ways.map(way => {
          const wf = form[way.key]
          if (!wf) return null
          const title = wayTitle(ctx.say, way.key)
          // Release 8: a card that is always on (how members move up) is ticked and stays ticked.
          const fixed = alwaysOn(way)
          return (
            <label key={way.key} data-tick={way.key} data-checked={wf.on ? '' : undefined}
              className={`flex gap-3 rounded-2xl border p-4 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-a-accent-text ${fixed ? '' : 'cursor-pointer'} ${wf.on ? 'border-a-accent-text bg-a-accent/10' : 'border-a-border bg-a-surface hover:bg-a-surface-2'}`}>
              <input type="checkbox" checked={wf.on} disabled={fixed} onChange={(e) => onChange({ ...form, [way.key]: { ...wf, on: e.target.checked } })}
                className="mt-1 h-4 w-4 shrink-0 rounded border-a-border accent-a-accent-text disabled:opacity-60" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex items-center gap-2">
                  <WayIcon way={way.key} on={wf.on} />
                  <span className="font-medium text-a-text">{title}</span>
                </span>
                <span className="block text-sm text-a-text-2">{wayLine(ctx.say, way.key)}</span>
                {wf.on && <span data-sentence="" className="block text-sm text-a-text">{sentenceOf(way.key, previewOptions(way, wf, answer.options, answer.fields), ctx)}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

// ─── 3. Configure ─────────────────────────────────────────────────────────

/** The ticked ways' numbers, prefilled, each with what members get as it stands. */
export function Configure({ answer, form, problems, ctx, onChange }: {
  answer: OptionsAnswer
  form: OptionsForm
  problems: Problems
  ctx: Ctx
  onChange: (way: string, key: string, value: string) => void
}) {
  const { t } = useTranslation()
  const ways = configurable(answer, form)
  if (ways.length === 0) {
    return <p className="rounded-xl border border-dashed border-a-border px-4 py-6 text-center text-sm text-a-text-2">{t('loyalty.options.wizard.nothing_to_set', 'Nothing to set: the ways you chose have no numbers. Go on to the review.')}</p>
  }
  return (
    <div className="space-y-3">
      {ways.map(way => (
        <section key={way.key} data-configure={way.key} aria-labelledby={`configure-${way.key}`} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <WayIcon way={way.key} on />
            <SectionTitle><span id={`configure-${way.key}`}>{wayTitle(ctx.say, way.key)}</span></SectionTitle>
          </div>
          <WayFields way={way} form={form[way.key]} fields={answer.fields} rewards={answer.catalogue.rewards} problems={problems}
            disabled={false} currency={ctx.currency} locale={ctx.locale} onChange={(key, value) => onChange(way.key, key, value)} />
          <Sentence>{sentenceOf(way.key, previewOptions(way, form[way.key], answer.options, answer.fields), ctx)}</Sentence>
        </section>
      ))}
    </div>
  )
}

// ─── 4. Review ────────────────────────────────────────────────────────────

/** What members will get, in sentences, the ways left off, and where the programme starts from. */
export function Review({ answer, form, choice, keep, ctx }: { answer: OptionsAnswer; form: OptionsForm; choice: string; keep: boolean; ctx: Ctx }) {
  const { t } = useTranslation()
  const review = reviewOf(answer, form, answer.options, ctx)
  const preset = keep ? null : presetOf(answer, choice)
  return (
    <div className="space-y-4">
      <div data-review-start="" className="rounded-2xl border border-a-border bg-a-surface-2 p-4 text-sm text-a-text">
        {preset
          ? t('loyalty.options.wizard.review_preset', 'Starts from {{preset}}: the tiers {{tiers}} and a first rewards catalogue.', { preset: presetName(t, preset), tiers: preset.tier_names.join(', ') })
          : t('loyalty.options.wizard.review_keep', 'Your tiers and rewards stay as they are.')}
      </div>
      {review.on.length > 0
        ? (
          <ul data-review="" className="space-y-2">
            {review.on.map(line => (
              <li key={line.key} data-review-way={line.key} className="flex gap-3 rounded-2xl border border-a-border bg-a-surface p-4">
                <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-a-accent text-a-accent-ink"><Check size={14} /></span>
                <span className="min-w-0 space-y-0.5">
                  <span className="block font-medium text-a-text">{wayTitle(ctx.say, line.key)}</span>
                  <span className="block text-sm text-a-text">{line.text}</span>
                </span>
              </li>
            ))}
          </ul>
        )
        : <Notice tone="warning">{t('loyalty.options.wizard.none_on', 'No way to earn is ticked: members would earn nothing. Go back and tick at least one, or apply as it is.')}</Notice>}
      {review.off.length > 0 && (
        <p data-review-off="" className="text-sm text-a-text-2">
          {t('loyalty.options.wizard.review_off', 'Not used: {{ways}}. Switch any of them on later under Ways to earn.', { ways: review.off.map(key => wayTitle(ctx.say, key)).join(', ') })}
        </p>
      )}
    </div>
  )
}

// ─── Done ─────────────────────────────────────────────────────────────────

function Done({ outcome, headingRef }: { outcome: SetupOutcome; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const summary = outcome.summary ?? {}
  const n = (key: string) => points(Number(summary[key] ?? 0), locale)
  let line: ReactNode = t('loyalty.options.wizard.done_kept', 'Your tiers and rewards stayed as they were; the ways to earn are set.')
  if (outcome.preset_applied) {
    line = t('loyalty.options.wizard.done_built', 'Tiers added: {{tiers}}. Rewards added: {{rewards}}. The ways to earn are set.', { tiers: n('tiers_added'), rewards: n('rewards_added') })
  }
  return (
    <div data-setup-done="" className="max-w-2xl space-y-4">
      <h2 ref={headingRef} tabIndex={-1} className="font-a-display text-2xl font-normal leading-snug text-a-text outline-none">
        {t('loyalty.options.wizard.done_title', 'Your programme is set up')}
      </h2>
      <Notice tone="success">{line}</Notice>
      <div className="flex flex-wrap gap-2">
        <Link to="/loyalty/options" className="inline-flex items-center gap-2 rounded-full bg-a-accent px-4 py-2.5 text-sm font-semibold text-a-accent-ink shadow-a-sm hover:bg-a-accent-deep">
          {t('loyalty.options.wizard.to_options', 'Go to Ways to earn')}
        </Link>
        <Link to="/loyalty" className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          {t('loyalty.options.wizard.to_members', 'Go to Members')}
        </Link>
      </div>
    </div>
  )
}
