import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Award, CalendarDays, CheckCheck, Gift, Pencil, Plus, Sparkles, Trash2, TrendingUp, Users, X, Zap } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import type { ThemeName } from '../../workspace/theme/accent'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { amountOf, money, points, when } from '../lib/format'
import { useLook } from '../lib/look'
import { TierChip } from '../ui/TierChip'
import { PROGRAM_KEY, afterProgramChange, programApi } from './api'
import { BenefitDialog } from './BenefitDialog'
import { BoostDialog } from './BoostDialog'
import { ERRORS } from './errors'
import { ConfirmDialog, ToneBadge } from '../ui/formParts'
import { activeTone, boostState, boostTone, needsTimeCheck, programActions, thresholds, timeCheckList, typedValue, weekdaysText } from './programMath'
import { chosenTiers, decimal, named } from '../lib/forms'
import { TierBenefitDialog } from './TierBenefitDialog'
import { TierDialog } from './TierDialog'
import type { Benefit, Boost, Program, Tier, TierBenefit } from './types'
import { APPLIES_TO_WORDS, BOOST_STATE_WORDS, CATEGORY_WORDS, FULFILLMENT_WORDS, THRESHOLD_WORDS, VALUE_PHRASE_WORDS } from './words'
import { PlacesSection } from '../places/PlacesSection'
import { TierPlaces } from '../places/TierPlaces'
import { Switch } from '../options/parts'
import { IconButton, SectionHead } from './parts'

/** Which dialog is open, with what it works on. */
type Open =
  | { kind: 'tier'; tier: Tier | null }
  | { kind: 'tier_benefit'; tier: Tier; current: TierBenefit | null }
  | { kind: 'take_off'; tier: Tier; tb: TierBenefit }
  | { kind: 'benefit'; benefit: Benefit | null }
  | { kind: 'boost'; boost: Boost | null }
  | { kind: 'remove_boost'; boost: Boost }
  | { kind: 'confirm_times'; boosts: Boost[] }

/**
 * Program (spec 2026-10-21 §4.5): the tier ladder with what reaches each tier and what it gives, the benefit catalogue,
 * and the boost events that multiply points for a while. Everyone reads it; a manager adds and changes (§5) — for
 * anyone else the page has no action at all, and says why.
 */
export function ProgramPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const query = useQuery({ queryKey: PROGRAM_KEY, queryFn: programApi.program })
  const { manage } = programActions(boot.staff.can)
  const [open, setOpen] = useState<Open | null>(null)
  const close = () => setOpen(null)
  const data = query.data

  return (
    <div className="space-y-8 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.program.title', 'Program')}
        below={!manage && <p data-read-only="" className="text-sm text-a-text-2">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}>
        {/* Release 7: the other ways to earn (points on spend, bonuses, stamps, check-in, cashback) are set there. */}
        <Link to="/loyalty/options" className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          <Sparkles size={15} aria-hidden />{t('loyalty.options.ways_link', 'Ways to earn')}
        </Link>
      </PageHeader>

      {query.isError && !data && (
        <div className="max-w-xl space-y-3">
          <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'load', failureOf(query.error)))}</Notice>
          <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
        </div>
      )}
      {!data && query.isLoading && (
        <div role="status" className="space-y-3">
          <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
          <div className="grid gap-3 xl:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
          <Skeleton className="h-32" />
        </div>
      )}

      {data && (
        <>
          <Tiers program={data} manage={manage} theme={look.resolved} locale={locale} onOpen={setOpen} />
          <Benefits program={data} manage={manage} onOpen={setOpen} />
          {/* Release 8: places and the tiers each admits. */}
          <PlacesSection manage={manage} />
          <Boosts program={data} manage={manage} theme={look.resolved} locale={locale} timeZone={boot.venue.timezone} onOpen={setOpen} />
        </>
      )}

      {data && open?.kind === 'tier' && <TierDialog tier={open.tier} onClose={close} />}
      {data && open?.kind === 'tier_benefit' && (
        <TierBenefitDialog tier={open.tier} current={open.current} benefits={data.benefits} options={data.options} onClose={close} />
      )}
      {open?.kind === 'take_off' && <TakeOff tier={open.tier} tb={open.tb} onClose={close} />}
      {data && open?.kind === 'benefit' && <BenefitDialog benefit={open.benefit} options={data.options} onClose={close} />}
      {data && open?.kind === 'boost' && <BoostDialog boost={open.boost} tiers={data.tiers} brands={data.options.brands} onClose={close} />}
      {open?.kind === 'remove_boost' && <RemoveBoost boost={open.boost} onClose={close} />}
      {open?.kind === 'confirm_times' && <ConfirmTimes boosts={open.boosts} locale={locale} timeZone={boot.venue.timezone} onClose={close} />}
    </div>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-a-border px-4 py-6 text-center text-sm text-a-text-2">{children}</p>
}

// ─── Tiers ─────────────────────────────────────────────────────────────────

function Tiers({ program, manage, theme, locale, onOpen }: { program: Program; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="program-tiers" className="space-y-3">
      <SectionHead id="program-tiers" icon={Award} title={t('loyalty.program.tiers.title', 'Tiers')}>
        {manage && <Button size="sm" onClick={() => onOpen({ kind: 'tier', tier: null })}><Plus size={15} aria-hidden />{t('loyalty.program.tiers.add', 'Add tier')}</Button>}
      </SectionHead>
      {program.tiers.length === 0
        ? <Empty>{manage ? t('loyalty.program.tiers.none_manager', 'No tiers yet. Add the first one: the programme starts once a tier is in use.') : t('loyalty.program.tiers.none', 'No tiers yet.')}</Empty>
        : (
          <ol aria-label={t('loyalty.program.tiers.ladder', 'The ladder, from the first tier up')}>
            {program.tiers.map((tier, i) => (
              <TierCard key={tier.id} tier={tier} step={i + 1} last={i === program.tiers.length - 1} manage={manage} theme={theme} locale={locale} onOpen={onOpen} />
            ))}
          </ol>
        )}
    </section>
  )
}

/**
 * One step of the ladder: its number on the rail, the tier's chip (and "Switched off" when it is), what reaches it on
 * the programme's measure, its earn rate, its members, the places it can enter and its benefits.
 */
export function TierCard({ tier, step, last, manage, theme, locale, onOpen }: {
  tier: Tier; step: number; last: boolean; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void
}) {
  const { t } = useTranslation()
  // Release 8: what reaches the tier, on the programme's measure (points, visits or spend).
  const boot = useBoot()
  const by = boot.programme.progress_by ?? 'points'
  const currency = boot.venue.currency
  return (
    <li data-tier={tier.id} className="flex gap-3 sm:gap-4">
      <div aria-hidden className="flex w-8 shrink-0 flex-col items-center">
        <span className={`mt-4 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${tier.is_active ? 'bg-a-accent/10 text-a-accent-text' : 'border border-a-border bg-a-surface text-a-text-2'}`}>{step}</span>
        {!last && <span className="mt-1 w-px flex-1 bg-a-border" />}
      </div>

      <div className={`relative mb-3 min-w-0 flex-1 rounded-2xl border border-a-border bg-a-surface p-4 ${last ? 'mb-0' : ''}`}>
        {manage && (
          <span className="absolute right-2 top-2">
            <IconButton icon={Pencil} label={t('loyalty.program.edit', 'Edit')} name={tier.name} onClick={() => onOpen({ kind: 'tier', tier })} />
          </span>
        )}
        <div className="flex flex-col gap-3 lg:flex-row lg:gap-6">
          <div className="space-y-2 lg:w-52 lg:shrink-0">
            <div className={`flex flex-wrap items-center gap-2 ${manage ? 'pr-10' : ''}`}>
              <TierChip tier={tier} theme={theme} />
              {!tier.is_active && <ToneBadge tone={activeTone(false)}>{t('loyalty.program.switched_off', 'Switched off')}</ToneBadge>}
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-1">
              {thresholds(tier, by).map(th => (
                <div key={th.kind}>
                  <dt className="text-xs text-a-text-2">{t(`loyalty.program.threshold.${th.kind}`, THRESHOLD_WORDS[th.kind])}</dt>
                  <dd className="font-a-display text-2xl leading-tight tabular-nums text-a-text">
                    {th.value === null
                      ? <span className="font-sans text-sm text-a-text-2">{t('loyalty.program.threshold.not_set', 'Not set')}</span>
                      : th.kind === 'spend' ? (by === 'spend' ? money(th.value, currency, locale) : decimal(th.value, locale)) : points(th.value, locale)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <div className={`min-w-0 flex-1 space-y-3 ${manage ? 'lg:pr-10' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm">
              <dl className="flex flex-wrap items-center gap-x-5 gap-y-1.5">
                <div className="inline-flex items-center gap-1.5">
                  <TrendingUp size={14} aria-hidden className="text-a-text-2" />
                  <dt className="text-a-text-2">{t('loyalty.program.tiers.earn_rate', 'Earn rate')}</dt>
                  <dd className="font-semibold tabular-nums text-a-text">×{decimal(tier.earn_rate, locale)}</dd>
                </div>
                <div className="inline-flex items-center gap-1.5">
                  <Users size={14} aria-hidden className="text-a-text-2" />
                  <dt className="text-a-text-2">{t('loyalty.program.tiers.members', 'Members')}</dt>
                  <dd className="font-semibold tabular-nums text-a-text">{points(tier.members, locale)}</dd>
                </div>
              </dl>
              {/* Release 8: the places this tier can enter. */}
              <TierPlaces tierId={tier.id} />
            </div>

            {tier.benefits.length === 0 && !manage && <p className="text-sm text-a-text-2">{t('loyalty.program.tiers.no_benefits', 'This tier gives no benefit yet.')}</p>}
            {(tier.benefits.length > 0 || manage) && (
              <ul aria-label={t('loyalty.program.tiers.benefits', 'Benefits')} className="flex flex-wrap gap-2">
                {tier.benefits.map(tb => <BenefitChip key={tb.id} tb={tb} tier={tier} manage={manage} locale={locale} onOpen={onOpen} />)}
                {manage && (
                  <li>
                    <button type="button" onClick={() => onOpen({ kind: 'tier_benefit', tier, current: null })}
                      className="inline-flex min-h-8 items-center gap-1 rounded-full border border-dashed border-a-border px-3 py-1 text-sm font-medium text-a-accent-text hover:bg-a-accent/10">
                      <Plus size={14} aria-hidden />{t('loyalty.program.tiers.add_benefit', 'Add benefit')}<span className="sr-only"> {tier.name}</span>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

/** A benefit a tier gives, with its wording, its typed value and where it counts; a manager changes it or takes it off. */
function BenefitChip({ tb, tier, manage, locale, onOpen }: { tb: TierBenefit; tier: Tier; manage: boolean; locale: string; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  const currency = useBoot().venue.currency
  const typed = typedValue(tb)
  const scope = tb.applies_to !== 'all' ? named('loyalty.program.applies_to', APPLIES_TO_WORDS, tb.applies_to) : null
  const phrase = typed ? t(`loyalty.program.value_phrase.${typed.type}`, VALUE_PHRASE_WORDS[typed.type], { amount: amountOf(typed.type, typed.amount, currency, locale) }) : null
  // The wording when there is one, else the typed value in words — never both ("5 % off services · 5% off"); the
  // typed value stays in the chip's tip, where a manager checks that the two agree.
  const detail = [
    tb.value || phrase,
    scope ? t(...scope) : tb.applies_to !== 'all' ? tb.applies_to : null,
  ].filter(Boolean).join(' · ')
  const words = <><span className="font-medium">{tb.name}</span>{detail && <span className="text-a-text-2"> · {detail}</span>}</>

  return (
    <li data-tier-benefit={tb.id} title={tb.value && phrase ? phrase : undefined} className="inline-flex max-w-full items-center rounded-2xl border border-a-border bg-a-surface-2 text-sm text-a-text">
      {manage ? (
        <button type="button" onClick={() => onOpen({ kind: 'tier_benefit', tier, current: tb })} className="min-w-0 rounded-2xl py-1 pl-3 pr-1.5 text-left hover:underline">
          <span className="sr-only">{t('loyalty.program.tiers.change_benefit', 'Change')} </span>{words}
        </button>
      ) : (
        <span className="min-w-0 px-3 py-1">{words}</span>
      )}
      {manage && (
        <button type="button" onClick={() => onOpen({ kind: 'take_off', tier, tb })}
          aria-label={t('loyalty.program.tiers.take_off_label', 'Take {{benefit}} off {{tier}}', { benefit: tb.name, tier: tier.name })}
          className="mr-1 shrink-0 rounded-full p-1 text-a-text-2 hover:bg-a-surface hover:text-a-text">
          <X size={14} aria-hidden />
        </button>
      )}
    </li>
  )
}

/** Take a benefit off a tier, once asked: the server switches it off, so the members' history keeps its name. */
function TakeOff({ tier, tb, onClose }: { tier: Tier; tb: TierBenefit; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => programApi.detachBenefit(tier.id, tb.id),
    onSuccess: () => { afterProgramChange(client, { benefits: true }); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client, { benefits: true }) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog title={t('loyalty.program.take_off.title', 'Take {{benefit}} off {{tier}}?', { benefit: tb.name, tier: tier.name })}
      confirm={t('loyalty.program.take_off.confirm', 'Take it off')} keep={t('loyalty.program.take_off.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.program', ERRORS, 'tier_benefit', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.program.take_off.body', 'Members of {{tier}} stop seeing it in the app and the portal. Requests they already made stay as they are.', { tier: tier.name })}</p>
    </ConfirmDialog>
  )
}

// ─── The benefit catalogue ────────────────────────────────────────────────

function Benefits({ program, manage, onOpen }: { program: Program; manage: boolean; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  return (
    <section aria-labelledby="program-benefits" className="space-y-3">
      <SectionHead id="program-benefits" icon={Gift} title={t('loyalty.program.benefits.title', 'Benefits')}>
        {manage && <Button size="sm" onClick={() => onOpen({ kind: 'benefit', benefit: null })}><Plus size={15} aria-hidden />{t('loyalty.program.benefits.add', 'Add benefit')}</Button>}
      </SectionHead>
      {program.benefits.length === 0
        ? <Empty>{t('loyalty.program.benefits.none', 'The catalogue is empty. Benefits such as late checkout or a welcome drink are added here, then given to tiers.')}</Empty>
        : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {program.benefits.map(b => <BenefitRow key={b.id} benefit={b} manage={manage} onOpen={onOpen} />)}
          </ul>
        )}
    </section>
  )
}

/**
 * A catalogue entry: its name, and its category and how it is given in one line. A manager edits it and switches it on
 * or off with its switch (which shows its state); anyone else sees "Switched off" on one that is.
 */
export function BenefitRow({ benefit: b, manage, onOpen }: { benefit: Benefit; manage: boolean; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const [failure, setFailure] = useState<ApiFailure | null>(null)
  const flip = useMutation({
    mutationFn: () => programApi.updateBenefit(b.id, { is_active: !b.is_active }),
    onMutate: () => setFailure(null),
    onSuccess: () => afterProgramChange(client, { benefits: true }),
    onError: (error) => { setFailure(failureOf(error)); afterProgramChange(client, { benefits: true }) },
  })
  const category = named('loyalty.program.category', CATEGORY_WORDS, b.category)
  const mode = named('loyalty.program.fulfillment_mode', FULFILLMENT_WORDS, b.fulfillment_mode)
  const kind = [category ? t(...category) : b.category, mode ? t(...mode) : b.fulfillment_mode].filter(Boolean).join(' · ')

  return (
    <li data-benefit={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-a-border bg-a-surface px-3 py-2.5">
      <span aria-hidden className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${b.is_active ? 'bg-a-accent/10 text-a-accent-text' : 'bg-a-surface-2 text-a-text-2'}`}>
        <Gift size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${b.is_active ? 'text-a-text' : 'text-a-text-2'}`}>{b.name}</p>
        {kind && <p className="truncate text-xs text-a-text-2">{kind}</p>}
      </div>
      {!manage && !b.is_active && <ToneBadge tone={activeTone(false)}>{t('loyalty.program.switched_off', 'Switched off')}</ToneBadge>}
      {manage && (
        <div className="flex items-center gap-1">
          <IconButton icon={Pencil} label={t('loyalty.program.edit', 'Edit')} name={b.name} onClick={() => onOpen({ kind: 'benefit', benefit: b })} />
          <Switch on={b.is_active} label={b.name} disabled={flip.isPending}
            title={b.is_active ? t('loyalty.program.benefits.switch_off', 'Switch off') : t('loyalty.program.benefits.switch_on', 'Switch on')}
            onChange={() => flip.mutate()} />
        </div>
      )}
      {failure && <div className="w-full"><Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'benefit', failure))}</Notice></div>}
    </li>
  )
}

// ─── Boost events ─────────────────────────────────────────────────────────

function Boosts({ program, manage, theme, locale, timeZone, onOpen }: {
  program: Program; manage: boolean; theme: ThemeName; locale: string; timeZone: string; onOpen: (open: Open) => void
}) {
  const { t } = useTranslation()
  const flagged = timeCheckList(program.boosts)
  return (
    <section aria-labelledby="program-boosts" className="space-y-3">
      <SectionHead id="program-boosts" icon={Zap} title={t('loyalty.program.boosts.title', 'Boost events')}>
        {manage && <Button size="sm" onClick={() => onOpen({ kind: 'boost', boost: null })}><Plus size={15} aria-hidden />{t('loyalty.program.boosts.add', 'Add boost')}</Button>}
      </SectionHead>
      {manage && flagged.length > 0 && (
        <div data-time-check-all="" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-a-border bg-a-surface-2 px-4 py-3">
          <p className="min-w-0 flex-1 text-sm text-a-text">
            {t('loyalty.program.time_check.all_line', 'Some boosts ask for their times to be checked. If the times shown are right, confirm them together.')}
          </p>
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: 'confirm_times', boosts: flagged })}>
            <CheckCheck size={15} aria-hidden />{t('loyalty.program.time_check.confirm_all', 'These times are right')}
          </Button>
        </div>
      )}
      {program.boosts.length === 0
        ? <Empty>{t('loyalty.program.boosts.none', 'No boosts. A boost multiplies the points members earn for a while, such as a double points weekend.')}</Empty>
        : (
          <ul className="grid gap-2 lg:grid-cols-2">
            {program.boosts.map(boost => (
              <BoostRow key={boost.id} boost={boost} tiers={program.tiers} manage={manage} theme={theme} locale={locale} timeZone={timeZone} onOpen={onOpen} />
            ))}
          </ul>
        )}
    </section>
  )
}

/** A boost: its multiplier, when it runs on the venue's clock, on which days and for which tiers, and where it stands. */
export function BoostRow({ boost, tiers, manage, theme, locale, timeZone, onOpen }: {
  boost: Boost; tiers: Tier[]; manage: boolean; theme: ThemeName; locale: string; timeZone: string; onOpen: (open: Open) => void
}) {
  const { t } = useTranslation()
  const state = boostState(boost.state)
  const days = weekdaysText(boost.days_of_week, locale)
  const chosen = chosenTiers(boost.tier_ids, tiers)

  return (
    <li data-boost={boost.id} className="flex items-start gap-3 rounded-xl border border-a-border bg-a-surface px-4 py-3 sm:gap-4">
      <span className={`w-12 shrink-0 pt-0.5 font-a-display text-2xl tabular-nums leading-tight sm:w-16 ${state === 'ended' || state === 'off' ? 'text-a-text-2' : 'text-a-accent-text'}`}>×{decimal(boost.multiplier, locale)}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 font-medium text-a-text">{boost.name}</p>
          <ToneBadge tone={boostTone(state)}>{t(`loyalty.program.boost_state.${state}`, BOOST_STATE_WORDS[state])}</ToneBadge>
        </div>
        <p className="flex items-start gap-1.5 text-sm text-a-text-2" title={t('loyalty.program.boost.clock_hint', 'On the venue’s clock ({{zone}}).', { zone: timeZone })}>
          <CalendarDays size={14} aria-hidden className="mt-0.5 shrink-0" />
          <span>
            {t('loyalty.program.boosts.range', '{{from}} – {{to}}', { from: when(boost.starts_at, locale, timeZone), to: when(boost.ends_at, locale, timeZone) })}
            {' · '}
            {days || t('loyalty.program.boosts.every_day', 'Every day')}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chosen.length === 0
            ? <span className="inline-flex items-center gap-1.5 text-xs text-a-text-2"><Users size={13} aria-hidden />{t('loyalty.program.boosts.every_tier', 'Every tier')}</span>
            : chosen.map(tier => <TierChip key={tier.id} tier={tier} theme={theme} size="sm" />)}
        </div>
        {boost.description && <p className="text-xs text-a-text-2">{boost.description}</p>}
        {needsTimeCheck(boost) && (
          <p data-time-check="" className="text-xs font-medium text-a-st-pending">
            {t('loyalty.program.time_check.row', 'Check the time: saved before boost times were read on the venue’s clock everywhere. If it was last saved in the full admin, it may start and end hours off. Open it, check the times and save.')}
          </p>
        )}
      </div>
      {manage && (
        <div className="-mr-2 -mt-1.5 flex shrink-0 flex-col items-center sm:flex-row">
          <IconButton icon={Pencil} label={t('loyalty.program.edit', 'Edit')} name={boost.name} onClick={() => onOpen({ kind: 'boost', boost })} />
          <IconButton icon={Trash2} danger label={t('loyalty.program.boosts.remove', 'Remove')} name={boost.name} onClick={() => onOpen({ kind: 'remove_boost', boost })} />
        </div>
      )}
    </li>
  )
}

/**
 * "These times are right" (release 6): the boosts that ask for their times to be checked, each with its times on the
 * venue's clock as Program shows them; confirming marks them as checked on the server and changes no time. A manager
 * whose boost is wrong keeps it ("Not yet") and corrects it in its own dialog.
 */
export function ConfirmTimes({ boosts, locale, timeZone, onClose }: { boosts: Boost[]; locale: string; timeZone: string; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const confirm = useMutation({
    mutationFn: () => programApi.confirmTimes(boosts.map(b => b.id)),
    onSuccess: () => { afterProgramChange(client); onClose() },
    onError: (error) => { if (['not_found', 'invalid'].includes(failureOf(error).code)) afterProgramChange(client) },
  })
  const failure = confirm.isError ? failureOf(confirm.error) : null
  return (
    <Dialog title={t('loyalty.program.time_check.confirm_title', 'Are these times right?')} onClose={onClose} busy={confirm.isPending}>
      <div className="space-y-4">
        <p className="text-sm text-a-text">
          {t('loyalty.program.time_check.confirm_body', 'These boosts were saved before boost times were read on the venue’s clock everywhere. Check that each starts and ends as shown, on the venue’s clock ({{zone}}). Confirming marks them as checked and changes no time; if one is wrong, choose Not yet and correct it.', { zone: timeZone })}
        </p>
        <ul data-time-check-list="" className="divide-y divide-a-border overflow-hidden rounded-xl border border-a-border">
          {boosts.map(boost => (
            <li key={boost.id} data-time-check-boost={boost.id} className="space-y-0.5 px-3 py-2">
              <p className="text-sm font-medium text-a-text">{boost.name}</p>
              <p className="text-sm tabular-nums text-a-text-2">
                {t('loyalty.program.boosts.range', '{{from}} – {{to}}', { from: when(boost.starts_at, locale, timeZone), to: when(boost.ends_at, locale, timeZone) })}
              </p>
            </li>
          ))}
        </ul>
        {failure && <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'times', failure))}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose} disabled={confirm.isPending}>{t('loyalty.program.time_check.keep', 'Not yet')}</Button>
          <Button type="button" loading={confirm.isPending} onClick={() => confirm.mutate()}>{t('loyalty.program.time_check.confirm_all', 'These times are right')}</Button>
        </div>
      </div>
    </Dialog>
  )
}

/** Remove a boost, once asked: points it already gave stay where they are. */
function RemoveBoost({ boost, onClose }: { boost: Boost; onClose: () => void }) {
  const { t } = useTranslation()
  const client = useQueryClient()
  const remove = useMutation({
    mutationFn: () => programApi.removeBoost(boost.id),
    onSuccess: () => { afterProgramChange(client); onClose() },
    onError: (error) => { if (failureOf(error).code === 'not_found') afterProgramChange(client) },
  })
  const failure = remove.isError ? failureOf(remove.error) : null
  return (
    <ConfirmDialog title={t('loyalty.program.remove_boost.title', 'Remove {{name}}?', { name: boost.name })}
      confirm={t('loyalty.program.remove_boost.confirm', 'Remove boost')} keep={t('loyalty.program.remove_boost.keep', 'Keep it')}
      busy={remove.isPending} failure={failure && t(...refusalKey('loyalty.program', ERRORS, 'boost', failure))}
      onConfirm={() => remove.mutate()} onClose={onClose}>
      <p>{t('loyalty.program.remove_boost.body', 'Points the boost already gave stay with the members. This cannot be undone; to pause it instead, switch it off.')}</p>
    </ConfirmDialog>
  )
}
