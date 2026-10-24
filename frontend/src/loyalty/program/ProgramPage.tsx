import { useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCheck, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import { SectionTitle } from '../../workspace/ui/Typography'
import type { ThemeName } from '../../workspace/theme/accent'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { amountOf, points, when } from '../lib/format'
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
      <PageHeader title={t('loyalty.program.title', 'Program')} line={t('loyalty.program.line', 'The tiers members climb, the benefits they give, and points boosts.')}
        below={!manage && <p data-read-only="" className="text-sm text-a-text-2">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>} />

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

function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <SectionTitle><span id={id}>{title}</span></SectionTitle>
      {children}
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
      <SectionHead id="program-tiers" title={t('loyalty.program.tiers.title', 'Tiers')}>
        {manage && <Button size="sm" onClick={() => onOpen({ kind: 'tier', tier: null })}><Plus size={15} aria-hidden />{t('loyalty.program.tiers.add', 'Add tier')}</Button>}
      </SectionHead>
      {program.tiers.length === 0
        ? <Empty>{manage ? t('loyalty.program.tiers.none_manager', 'No tiers yet. Add the first one: the programme starts once a tier is in use.') : t('loyalty.program.tiers.none', 'No tiers yet.')}</Empty>
        : (
          <ol aria-label={t('loyalty.program.tiers.ladder', 'The ladder, from the first tier up')} className="grid gap-3 xl:grid-cols-2">
            {program.tiers.map(tier => <TierCard key={tier.id} tier={tier} manage={manage} theme={theme} locale={locale} onOpen={onOpen} />)}
          </ol>
        )}
    </section>
  )
}

/** One tier: its chip, whether it is in use, what reaches it, its earn rate, its members and its benefits. */
export function TierCard({ tier, manage, theme, locale, onOpen }: { tier: Tier; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  return (
    <li data-tier={tier.id} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      <div className="flex flex-wrap items-center gap-2">
        <TierChip tier={tier} theme={theme} />
        <ToneBadge tone={activeTone(tier.is_active)}>{tier.is_active ? t('loyalty.program.in_use', 'In use') : t('loyalty.program.switched_off', 'Switched off')}</ToneBadge>
        {manage && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onOpen({ kind: 'tier', tier })}>
            <Pencil size={14} aria-hidden />{t('loyalty.program.edit', 'Edit')}<span className="sr-only"> {tier.name}</span>
          </Button>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
        {thresholds(tier).map(th => (
          <div key={th.kind}>
            <dt className="text-xs text-a-text-2">{t(`loyalty.program.threshold.${th.kind}`, THRESHOLD_WORDS[th.kind])}</dt>
            <dd className="text-sm font-semibold tabular-nums text-a-text">{th.kind === 'spend' ? decimal(th.value, locale) : points(th.value, locale)}</dd>
          </div>
        ))}
        <div>
          <dt className="text-xs text-a-text-2">{t('loyalty.program.tiers.earn_rate', 'Earn rate')}</dt>
          <dd className="text-sm font-semibold tabular-nums text-a-text">×{decimal(tier.earn_rate, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs text-a-text-2">{t('loyalty.program.tiers.members', 'Members')}</dt>
          <dd className="text-sm font-semibold tabular-nums text-a-text">{points(tier.members, locale)}</dd>
        </div>
      </dl>

      {tier.description && <p className="text-sm text-a-text-2">{tier.description}</p>}

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-a-text-2">{t('loyalty.program.tiers.benefits', 'Benefits')}</p>
        {tier.benefits.length === 0 && <p className="text-sm text-a-text-2">{t('loyalty.program.tiers.no_benefits', 'This tier gives no benefit yet.')}</p>}
        {(tier.benefits.length > 0 || manage) && (
          <ul className="flex flex-wrap gap-2">
            {tier.benefits.map(tb => <BenefitChip key={tb.id} tb={tb} tier={tier} manage={manage} locale={locale} onOpen={onOpen} />)}
            {manage && (
              <li>
                <button type="button" onClick={() => onOpen({ kind: 'tier_benefit', tier, current: null })}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-a-border px-3 py-1 text-sm font-medium text-a-accent-text hover:bg-a-accent/10">
                  <Plus size={14} aria-hidden />{t('loyalty.program.tiers.add_benefit', 'Add benefit')}<span className="sr-only"> {tier.name}</span>
                </button>
              </li>
            )}
          </ul>
        )}
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
  const detail = [
    tb.value,
    typed ? t(`loyalty.program.value_phrase.${typed.type}`, VALUE_PHRASE_WORDS[typed.type], { amount: amountOf(typed.type, typed.amount, currency, locale) }) : null,
    scope ? t(...scope) : tb.applies_to !== 'all' ? tb.applies_to : null,
  ].filter(Boolean).join(' · ')
  const words = <><span className="font-medium">{tb.name}</span>{detail && <span className="text-a-text-2"> · {detail}</span>}</>

  return (
    <li data-tier-benefit={tb.id} className="inline-flex max-w-full items-center rounded-full border border-a-border bg-a-surface-2 text-sm text-a-text">
      {manage ? (
        <button type="button" onClick={() => onOpen({ kind: 'tier_benefit', tier, current: tb })} className="min-w-0 truncate rounded-full py-1 pl-3 pr-1.5 text-left hover:underline">
          <span className="sr-only">{t('loyalty.program.tiers.change_benefit', 'Change')} </span>{words}
        </button>
      ) : (
        <span className="min-w-0 truncate px-3 py-1">{words}</span>
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
      <SectionHead id="program-benefits" title={t('loyalty.program.benefits.title', 'Benefits')}>
        {manage && <Button size="sm" onClick={() => onOpen({ kind: 'benefit', benefit: null })}><Plus size={15} aria-hidden />{t('loyalty.program.benefits.add', 'Add benefit')}</Button>}
      </SectionHead>
      <p className="text-sm text-a-text-2">{t('loyalty.program.benefits.line', 'The catalogue tiers choose their benefits from.')}</p>
      {program.benefits.length === 0
        ? <Empty>{t('loyalty.program.benefits.none', 'The catalogue is empty. Benefits such as late checkout or a welcome drink are added here, then given to tiers.')}</Empty>
        : (
          <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface">
            {program.benefits.map(b => <BenefitRow key={b.id} benefit={b} manage={manage} onOpen={onOpen} />)}
          </ul>
        )}
    </section>
  )
}

/** A catalogue entry: name, code, category, how it is given, in use or not; a manager changes it or switches it. */
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
    <li data-benefit={b.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-a-text">
          <span className="font-medium">{b.name}</span>
          {b.code && <span className="ml-2 font-a-mono text-xs text-a-text-2">{b.code}</span>}
        </p>
        {kind && <p className="text-xs text-a-text-2">{kind}</p>}
        {b.description && <p className="mt-0.5 line-clamp-2 text-xs text-a-text-2">{b.description}</p>}
      </div>
      <ToneBadge tone={activeTone(b.is_active)}>{b.is_active ? t('loyalty.program.in_use', 'In use') : t('loyalty.program.switched_off', 'Switched off')}</ToneBadge>
      {manage && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpen({ kind: 'benefit', benefit: b })}>
            <Pencil size={14} aria-hidden />{t('loyalty.program.edit', 'Edit')}<span className="sr-only"> {b.name}</span>
          </Button>
          <Button size="sm" variant="secondary" loading={flip.isPending} onClick={() => flip.mutate()}>
            {b.is_active ? t('loyalty.program.benefits.switch_off', 'Switch off') : t('loyalty.program.benefits.switch_on', 'Switch on')}<span className="sr-only"> {b.name}</span>
          </Button>
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
      <SectionHead id="program-boosts" title={t('loyalty.program.boosts.title', 'Boost events')}>
        {manage && <Button size="sm" onClick={() => onOpen({ kind: 'boost', boost: null })}><Plus size={15} aria-hidden />{t('loyalty.program.boosts.add', 'Add boost')}</Button>}
      </SectionHead>
      <p className="text-sm text-a-text-2">{t('loyalty.program.boosts.line', 'Times on the venue’s clock ({{zone}}).', { zone: timeZone })}</p>
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
          <ul className="divide-y divide-a-border overflow-hidden rounded-2xl border border-a-border bg-a-surface">
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
    <li data-boost={boost.id} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
      <span className="w-16 shrink-0 font-a-display text-2xl tabular-nums leading-tight text-a-text">×{decimal(boost.multiplier, locale)}</span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium text-a-text">{boost.name}</p>
        <p className="text-sm text-a-text-2">
          {t('loyalty.program.boosts.range', '{{from}} – {{to}}', { from: when(boost.starts_at, locale, timeZone), to: when(boost.ends_at, locale, timeZone) })}
          {' · '}
          {days || t('loyalty.program.boosts.every_day', 'Every day')}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {chosen.length === 0
            ? <span className="text-xs text-a-text-2">{t('loyalty.program.boosts.every_tier', 'Every tier')}</span>
            : chosen.map(tier => <TierChip key={tier.id} tier={tier} theme={theme} size="sm" />)}
        </div>
        {boost.description && <p className="text-xs text-a-text-2">{boost.description}</p>}
        {needsTimeCheck(boost) && (
          <p data-time-check="" className="text-xs font-medium text-a-st-pending">
            {t('loyalty.program.time_check.row', 'Check the time: saved before boost times were read on the venue’s clock everywhere. If it was last saved in the full admin, it may start and end hours off. Open it, check the times and save.')}
          </p>
        )}
      </div>
      <ToneBadge tone={boostTone(state)}>{t(`loyalty.program.boost_state.${state}`, BOOST_STATE_WORDS[state])}</ToneBadge>
      {manage && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={() => onOpen({ kind: 'boost', boost })}>
            <Pencil size={14} aria-hidden />{t('loyalty.program.edit', 'Edit')}<span className="sr-only"> {boost.name}</span>
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onOpen({ kind: 'remove_boost', boost })}>
            <Trash2 size={14} aria-hidden />{t('loyalty.program.boosts.remove', 'Remove')}<span className="sr-only"> {boost.name}</span>
          </Button>
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
