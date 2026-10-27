import { useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowRight, CalendarDays, CheckCheck, Crown, Gift, Lightbulb, MapPin, Pencil, PenLine, Plus, SlidersHorizontal, Sparkles, Trash2, Users, X, Zap } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { Skeleton } from '../../workspace/ui/Skeleton'
import type { ThemeName } from '../../workspace/theme/accent'
import { useBoot } from '../LoyaltyProvider'
import { failureOf, type ApiFailure } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { amountOf, listOf, money, points, when } from '../lib/format'
import { useLook } from '../lib/look'
import { TierChip } from '../ui/TierChip'
import { PROGRAM_KEY, afterProgramChange, programApi } from './api'
import { BenefitDialog } from './BenefitDialog'
import { BoostDialog } from './BoostDialog'
import { ERRORS } from './errors'
import { ConfirmDialog, ToneBadge } from '../ui/formParts'
import {
  activeTone, boostState, boostTone, needsTimeCheck, programActions, programSearch, programSectionFrom, thresholds, timeCheckList, typedValue, weekdaysText,
  type ProgramSection,
} from './programMath'
import { chosenTiers, decimal, named } from '../lib/forms'
import { TierBenefitDialog } from './TierBenefitDialog'
import { TierDialog } from './TierDialog'
import { TierEditorPage } from './TierEditorPage'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { OverviewButton } from '../overview/OverviewUI'
import { useRedesignWords } from '../redesign/words'
import { readableTierColor } from '../redesign/designMath'
import programDiagonal from '../redesign/assets/program-diagonal.svg'
import type { Benefit, Boost, Program, ProgramAdvice, Tier, TierBenefit } from './types'
import { APPLIES_TO_WORDS, BOOST_STATE_WORDS, CATEGORY_WORDS, FULFILLMENT_WORDS, THRESHOLD_WORDS, VALUE_PHRASE_WORDS } from './words'
import { PlacesSection } from '../places/PlacesSection'
import { PLACES_KEY, placesApi } from '../places/placesApi'
import { TierPlaces } from '../places/TierPlaces'
import { Switch } from '../options/parts'
import { GetStarted, GetStartedExample, SectionIntro } from '../ui/GetStarted'
import { SectionCards, SectionCount } from '../ui/SectionCards'
import type { Hue } from '../ui/sections'
import { IconButton, SectionHead } from './parts'
import { RemoveBenefit, RemoveTier, RenameDialog } from './RemoveDialogs'

/** Which dialog is open, with what it works on. */
type Open =
  | { kind: 'tier'; tier: Tier | null }
  | { kind: 'rename_tier'; tier: Tier }
  | { kind: 'remove_tier'; tier: Tier }
  | { kind: 'tier_benefit'; tier: Tier; current: TierBenefit | null }
  | { kind: 'take_off'; tier: Tier; tb: TierBenefit }
  | { kind: 'benefit'; benefit: Benefit | null }
  | { kind: 'rename_benefit'; benefit: Benefit }
  | { kind: 'remove_benefit'; benefit: Benefit }
  | { kind: 'boost'; boost: Boost | null }
  | { kind: 'remove_boost'; boost: Boost }
  | { kind: 'confirm_times'; boosts: Boost[] }

/** Each section's colour (the owner's drafts: tiers blue, benefits violet, places teal, boosts gold). */
const SECTION_HUE: Record<ProgramSection, Hue> = { tiers: 'tier', benefits: 'rule', places: 'place', boosts: 'gift' }

/**
 * Program (spec 2026-10-21 §4.5): the tier ladder with what reaches each tier and what it gives, the benefit catalogue,
 * the places members may enter and the boost events that multiply points for a while. Everyone reads it; a manager adds
 * and changes (§5) — for anyone else the page has no action at all, and says why. Release 10 (the owner's Figma
 * 163:88–163:400): one section at a time, chosen on its card and kept in the address; each opens with a line of what it
 * is for, and an empty one teaches how to start.
 */
export function ProgramPage() {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const boot = useBoot()
  const look = useLook()
  const query = useQuery({ queryKey: PROGRAM_KEY, queryFn: programApi.program })
  // The same call (and key) as the Places section's own, for its card's count.
  const places = useQuery({ queryKey: PLACES_KEY, queryFn: placesApi.list })
  const { manage } = programActions(boot.staff.can)
  const [open, setOpen] = useState<Open | null>(null)
  const close = () => setOpen(null)
  const data = query.data
  const location = useLocation()
  const navigate = useNavigate()
  const section = programSectionFrom(location.search, location.hash)
  const say = useRedesignWords()
  const editorId = new URLSearchParams(location.search).get('tier')
  const openTier = (tier: Tier | null) => navigate(`/loyalty/program?tab=tiers&tier=${tier?.id ?? 'new'}`)
  const onOpen = (value: Open) => { if (value.kind === 'tier') openTier(value.tier); else setOpen(value) }
  if (editorId && section === 'tiers') return <TierEditorPage id={editorId} />
  const go = (next: ProgramSection) => navigate({ pathname: '/loyalty/program', search: programSearch(next) }, { replace: true })
  const count = (n: number | undefined) => (n === undefined ? undefined : <SectionCount value={points(n, locale)} />)
  // The ladder's warnings wait on its card, in the waiting colour, as Ways to earn's do on its Overview.
  const tierWarnings = (data?.advice ?? []).filter(a => a.level === 'warn' && a.code === 'tiers_share_threshold').length

  return (
    <div className="l-ov-page l-rd-page">
      {section === 'tiers' ? <>
        <header className="l-ov-page-heading"><div><h1>{t('loyalty.program.title', 'Program')}</h1><p>{say('programLine')}</p></div>{manage && <div className="l-rd-actions"><Link className="l-ov-button" to="/loyalty/options/setup">{say('guidedSetup')}</Link>{!!data?.tiers.length && <OverviewButton primary onClick={() => openTier(null)}>{say('addLevel')}</OverviewButton>}</div>}</header>
        {!manage && <p data-read-only="">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}
        <section className="l-rd-program-explainer"><img src={programDiagonal} alt="" /><div><h2>{say('howMove')}</h2><p>{say(boot.programme.progress_by === 'visits' ? 'moveVisits' : boot.programme.progress_by === 'spend' ? 'moveSpend' : 'movePoints')}</p><small>{say('moveNote')}</small></div><Link className="l-ov-link" to="/loyalty/options?tab=rules">{say('qualificationRules')}</Link></section>
      </> : <>      <PageHeader stacked title={t('loyalty.program.title', 'Program')}
        line={t('loyalty.program.line', 'Your tiers, what each gives, where members may enter, and the boosts that bring them back.')}
        below={!manage && <p data-read-only="" className="text-sm text-a-text-2">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}>
        {/* Release 7: the other ways to earn (points on spend, bonuses, stamps, check-in, cashback) are set there. */}
        <Link to="/loyalty/options" className="inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
          <Sparkles size={15} aria-hidden />{t('loyalty.options.ways_link', 'Ways to earn')}
        </Link>
      </PageHeader>

      <SectionCards label={t('loyalty.program.sections', 'Program sections')} idPrefix="program-section" panelId="program-panel" value={section} onChange={go}
        items={[
          { id: 'tiers', icon: Crown, hue: SECTION_HUE.tiers, title: t('loyalty.program.tiers.title', 'Tiers'), caption: t('loyalty.program.section.tiers', 'Levels and what reaches them'),
            badge: tierWarnings > 0 ? <SectionCount waiting value={points(tierWarnings, locale)} waitingLabel={t('loyalty.program.to_check', 'to check')} /> : count(data?.tiers.length) },
          { id: 'benefits', icon: Gift, hue: SECTION_HUE.benefits, title: t('loyalty.program.benefits.title', 'Benefits'), caption: t('loyalty.program.section.benefits', 'Perks each tier includes'), badge: count(data?.benefits.length) },
          { id: 'places', icon: MapPin, hue: SECTION_HUE.places, title: t('loyalty.places.title', 'Places'), caption: t('loyalty.program.section.places', 'Entrances and who may enter'), badge: count(places.data?.places.length) },
          { id: 'boosts', icon: Zap, hue: SECTION_HUE.boosts, title: t('loyalty.program.boosts.title', 'Boost events'), caption: t('loyalty.program.section.boosts', 'Extra points for a while'), badge: count(data?.boosts.length) },
        ]} />

</>}

      <div id="program-panel" role={section === 'tiers' ? undefined : 'tabpanel'} aria-labelledby={section === 'tiers' ? undefined : `program-section-${section}`} className="space-y-5">
        {section !== 'tiers' && <SectionIntro hue={SECTION_HUE[section]}>{t(`loyalty.program.intro.${section}`, INTRO_WORDS[section])}</SectionIntro>}

        {section !== 'places' && query.isError && !data && (
          <div className="max-w-xl space-y-3">
            <Notice tone="danger">{t(...refusalKey('loyalty.program', ERRORS, 'load', failureOf(query.error)))}</Notice>
            <Button variant="secondary" onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</Button>
          </div>
        )}
        {section !== 'places' && !data && query.isLoading && (
          <div role="status" className="space-y-3">
            <span className="sr-only">{t('loyalty.common.loading', 'Loading…')}</span>
            <div className="grid gap-3 xl:grid-cols-2"><Skeleton className="h-40" /><Skeleton className="h-40" /></div>
            <Skeleton className="h-32" />
          </div>
        )}

        {data && section === 'tiers' && <Tiers program={data} manage={manage} theme={look.resolved} locale={locale} onOpen={onOpen} go={go} />}
        {data && section === 'benefits' && <Benefits program={data} manage={manage} onOpen={setOpen} go={go} />}
        {/* Release 8: places and the tiers each admits. */}
        {section === 'places' && <PlacesSection manage={manage} />}
        {data && section === 'boosts' && <Boosts program={data} manage={manage} theme={look.resolved} locale={locale} timeZone={boot.venue.timezone} onOpen={setOpen} />}
      </div>

      {data && open?.kind === 'tier' && <TierDialog tier={open.tier} onClose={close} />}
      {open?.kind === 'rename_tier' && <RenameDialog subject={{ kind: 'tier', tier: open.tier }} onClose={close} />}
      {open?.kind === 'remove_tier' && <RemoveTier tier={open.tier} onClose={close} />}
      {data && open?.kind === 'tier_benefit' && (
        <TierBenefitDialog tier={open.tier} current={open.current} benefits={data.benefits} options={data.options} onClose={close} />
      )}
      {open?.kind === 'take_off' && <TakeOff tier={open.tier} tb={open.tb} onClose={close} />}
      {data && open?.kind === 'benefit' && <BenefitDialog benefit={open.benefit} options={data.options} onClose={close} />}
      {open?.kind === 'rename_benefit' && <RenameDialog subject={{ kind: 'benefit', benefit: open.benefit }} onClose={close} />}
      {open?.kind === 'remove_benefit' && <RemoveBenefit benefit={open.benefit} onClose={close} />}
      {data && open?.kind === 'boost' && <BoostDialog boost={open.boost} tiers={data.tiers} brands={data.options.brands} onClose={close} />}
      {open?.kind === 'remove_boost' && <RemoveBoost boost={open.boost} onClose={close} />}
      {open?.kind === 'confirm_times' && <ConfirmTimes boosts={open.boosts} locale={locale} timeZone={boot.venue.timezone} onClose={close} />}
    </div>
  )
}

/** Each section's opening line: what it is for, in a sentence. */
const INTRO_WORDS: Record<ProgramSection, string> = {
  tiers: 'Members move up the ladder as they earn. Each tier sets its earn rate, its benefits and where it may enter.',
  benefits: 'Create a benefit once, then give it to any tier. A change here reaches every tier that gives it.',
  places: 'Entrances where staff check memberships. Each says which tiers may come in, and Scan uses it at the door.',
  boosts: 'A boost multiplies the points members earn for a while. Outside it, your normal earning rules stay in place.',
}

// ─── Tiers ─────────────────────────────────────────────────────────────────

function Tiers({ program, manage, theme, locale, onOpen, go }: {
  program: Program; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void; go: (section: ProgramSection) => void
}) {
  const { t } = useTranslation()
  const say = useRedesignWords()
  if (program.tiers.length === 0) return <GetStarted name="tiers" hue="tier" title={t('loyalty.program.get_started.tiers.title', 'Add your first tier')}
    line={t('loyalty.program.get_started.tiers.line', 'A tier is a level members reach, such as Silver or Gold, with its own earn rate and benefits. The programme starts once a tier is in use.')}
    steps={[
      { title: t('loyalty.program.get_started.tiers.s1_title', 'Name it'), line: t('loyalty.program.get_started.tiers.s1_line', 'Members see the name on their card and in the app.') },
      { title: t('loyalty.program.get_started.tiers.s2_title', 'Set what reaches it'), line: t('loyalty.program.get_started.tiers.s2_line', 'Points, visits or spend, as Ways to earn sets how members move up.') },
      { title: t('loyalty.program.get_started.tiers.s3_title', 'Give it benefits'), line: t('loyalty.program.get_started.tiers.s3_line', 'A welcome drink, late checkout or a discount, from the benefit catalogue.') },
    ]} action={manage && <OverviewButton primary onClick={() => onOpen({ kind: 'tier', tier: null })}>{say('addLevel')}</OverviewButton>} />
  return <section aria-labelledby="program-tiers" className="space-y-5">
    {(program.advice ?? []).filter(a => a.code === 'tiers_share_threshold').map(item => <SharedFigure key={item.params.value} item={item} program={program} manage={manage} locale={locale} onOpen={onOpen} />)}
    <div className="l-rd-levels-head"><h2 id="program-tiers">{say('levels')}</h2><small>{say('levelsCount', { levels: points(program.tiers.filter(tier => tier.is_active).length, locale), members: points(program.tiers.reduce((n, tier) => n + tier.members, 0), locale) })}</small><OverviewButton onClick={() => go('benefits')}>{say('catalogue')}</OverviewButton></div>
    <ol className="l-rd-level-grid" aria-label={t('loyalty.program.tiers.ladder', 'The ladder, from the first tier up')}>{program.tiers.map((tier, i) => <TierCard key={tier.id} tier={tier} step={i + 1} last={i === program.tiers.length - 1} manage={manage} theme={theme} locale={locale} onOpen={onOpen} />)}</ol>
    {manage && <div className="l-ov-inset l-rd-guided"><div><strong>{say('preferSetup')}</strong><small>{say('setupLine')}</small></div><Link className="l-ov-button" to="/loyalty/options/setup">{say('openSetup')}</Link></div>}
  </section>
}

/** PG-01 uses actual floors, member counts and included benefits; the complete ladder remains available. */
export function TierCard({ tier, manage, theme, locale, onOpen }: {
  tier: Tier; step: number; last: boolean; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void
}) {
  const { t } = useTranslation()
  const say = useRedesignWords()
  const boot = useBoot()
  const [all, setAll] = useState(false)
  const by = boot.programme.progress_by ?? 'points'
  const floors = thresholds(tier, by)
  return <li data-tier={tier.id} className="l-rd-tier-card">
    <header><h2 style={{ color: readableTierColor(tier.color, theme) }}>{tier.name}</h2><small className={tier.is_active ? 'l-rd-status-active' : ''}>{say(tier.is_active ? 'active' : 'off')}</small></header>
    <div className="l-rd-tier-body">
      <dl className="l-rd-tier-floors">{floors.map(th => <div key={th.kind}><dd>{th.value === null ? t('loyalty.program.threshold.not_set', 'Not set') : th.kind === 'spend' ? money(th.value, boot.venue.currency, locale) : points(th.value, locale)}</dd><dt>{t(`loyalty.program.threshold.${th.kind}`, THRESHOLD_WORDS[th.kind])}</dt></div>)}</dl>
      <div className="l-rd-tier-rate"><span>{t('loyalty.program.tiers.earn_rate', 'Earn rate')}</span><strong>×{decimal(tier.earn_rate, locale)} {t('loyalty.member.points', 'Points')}</strong></div>
      <Link className="l-ov-link" to={`/loyalty?tier=${tier.id}`}>{say('membersTotal', { n: points(tier.members, locale) })} →</Link>
      <TierPlaces tierId={tier.id} />
      <hr /><strong>{say('includedBenefits')}</strong>
      <ul className="l-rd-included-benefits">{(all ? tier.benefits : tier.benefits.slice(0, 3)).map(tb => <li key={tb.id}>✓ {tb.name}{tb.value && <small> · {tb.value}</small>}</li>)}</ul>
      {tier.benefits.length > 3 && !all && <button className="l-ov-link" onClick={() => setAll(true)}>{say('moreBenefits', { n: tier.benefits.length - 3 })}</button>}
      {!tier.benefits.length && <p>{t('loyalty.program.tiers.no_benefits', 'This tier gives no benefit yet.')}</p>}
      {tier.description && <small>{tier.description}</small>}
      {all && <ul className="l-rd-included-benefit-details">{tier.benefits.map(tb => <BenefitChip key={tb.id} tb={tb} tier={tier} manage={manage} locale={locale} onOpen={onOpen} />)}</ul>}
      {manage && <div data-tier-actions="" className="l-rd-tier-actions">
        <OverviewButton aria-label={`${say('editLevel')} ${tier.name}`} onClick={() => onOpen({ kind: 'tier', tier })}>{say('editLevel')}</OverviewButton>
        <OverviewButton aria-label={`${say('addBenefit')} ${tier.name}`} onClick={() => onOpen({ kind: 'tier_benefit', tier, current: null })}>+ {say('addBenefit')}</OverviewButton>
        <SideMenu kind="menu" place="down-right" named label={`${t('loyalty.membership.more.label', 'More')} ${tier.name}`} buttonClassName="l-ov-button l-rd-icon-button" listClassName="w-56" face="⋯">
          <button role="menuitem" className="l-rd-menu-item" onClick={() => onOpen({ kind: 'rename_tier', tier })}>{t('loyalty.program.rename.action', 'Rename')}</button>
          <button role="menuitem" className="l-rd-menu-item" onClick={() => setAll(true)}>{say('includedBenefits')}</button>
          <button role="menuitem" className="l-rd-menu-item" onClick={() => onOpen({ kind: 'remove_tier', tier })}>{t('loyalty.program.remove_tier.action', 'Delete')}</button>
        </SideMenu>
      </div>}
    </div>
  </li>
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
export function TakeOff({ tier, tb, onClose }: { tier: Tier; tb: TierBenefit; onClose: () => void }) {
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

/**
 * A check the server found (TierAdvice), as the owner's drafts draw one (163:88): in the waiting colour for a warning,
 * the rules' violet for a tip, with what is wrong in a sentence and what to do about it.
 */
function AdviceBanner({ code, level, title, line, children }: { code: string; level: 'warn' | 'tip'; title: string; line: string; children?: ReactNode }) {
  const Icon = level === 'warn' ? AlertTriangle : Lightbulb
  return (
    <div data-advice={code} data-level={level} data-hue={level === 'warn' ? 'gift' : 'rule'}
      className="l-hue-panel flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border px-4 py-3.5">
      <span aria-hidden className="l-hue-tile inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Icon size={18} /></span>
      <div className="min-w-[14rem] flex-1">
        <p className="font-semibold text-a-text">{title}</p>
        <p className="text-sm text-a-text-2">{line}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

/** Tiers that start at the same figure: which, at what, and — for a manager — each tier to open and give its own figure. */
function SharedFigure({ item, program, manage, locale, onOpen }: { item: ProgramAdvice; program: Program; manage: boolean; locale: string; onOpen: (open: Open) => void }) {
  const { t } = useTranslation()
  const boot = useBoot()
  const by = boot.programme.progress_by ?? 'points'
  const value = item.params.value ?? 0
  const figure = by === 'spend'
    ? money(value, boot.venue.currency, locale)
    : by === 'visits'
      ? t('loyalty.program.advice.visits', '{{n}} visits', { n: points(value, locale) })
      : t('loyalty.program.advice.points', '{{n}} points', { n: points(value, locale) })
  return (
    <AdviceBanner code={item.code} level={item.level}
      title={t('loyalty.program.advice.tiers_share_threshold.title', 'Several tiers start at the same figure')}
      line={t('loyalty.program.advice.tiers_share_threshold.line', '{{tiers}} all start at {{value}}: members reach only one of them by earning. Give each tier its own starting figure, or keep the others for members you place by hand.', {
        tiers: listOf(item.tiers.map(x => x.name), locale), value: figure,
      })}>
      {manage && item.tiers.map(ref => {
        const tier = program.tiers.find(x => x.id === ref.id)
        return tier && (
          <Button key={ref.id} size="sm" variant="secondary" onClick={() => onOpen({ kind: 'tier', tier })}>
            {t('loyalty.program.advice.open_tier', 'Open {{tier}}', { tier: ref.name })}
          </Button>
        )
      })}
    </AdviceBanner>
  )
}

// ─── The benefit catalogue ────────────────────────────────────────────────

function Benefits({ program, manage, onOpen, go }: { program: Program; manage: boolean; onOpen: (open: Open) => void; go: (section: ProgramSection) => void }) {
  const { t, i18n } = useTranslation()
  const unused = (program.advice ?? []).find(a => a.code === 'benefit_unused')
  return (
    <section aria-labelledby={program.benefits.length > 0 ? 'program-benefits' : undefined} className="space-y-3">
      {/* An empty catalogue is its Get started panel alone: one heading, one action (the owner's 163:322). */}
      {program.benefits.length > 0 && (
        <SectionHead id="program-benefits" icon={Gift} hue="rule" title={t('loyalty.program.benefits.title', 'Benefits')}>
          {manage && <Button size="sm" onClick={() => onOpen({ kind: 'benefit', benefit: null })}><Plus size={15} aria-hidden />{t('loyalty.program.benefits.add', 'Add benefit')}</Button>}
        </SectionHead>
      )}
      {program.benefits.length === 0
        ? (
          <GetStarted name="benefits" hue="rule" title={t('loyalty.program.get_started.benefits.title', 'Create your first benefit')}
            line={t('loyalty.program.get_started.benefits.line', 'Benefits are what a tier gives its members. Create one here, then give it to the tiers that should have it.')}
            steps={[
              { title: t('loyalty.program.get_started.benefits.s1_title', 'Name it'), line: t('loyalty.program.get_started.benefits.s1_line', 'Late checkout, a welcome drink, 10 % off services.') },
              { title: t('loyalty.program.get_started.benefits.s2_title', 'Choose how it is given'), line: t('loyalty.program.get_started.benefits.s2_line', 'Automatically, on request, or once staff approve it.') },
              { title: t('loyalty.program.get_started.benefits.s3_title', 'Give it to tiers'), line: t('loyalty.program.get_started.benefits.s3_line', 'On Tiers, press Add benefit on each tier that should have it.') },
            ]}
            action={manage && <Button onClick={() => onOpen({ kind: 'benefit', benefit: null })}><Plus size={15} aria-hidden />{t('loyalty.program.benefits.add', 'Add benefit')}</Button>} />
        )
        : (
          <>
            {unused && (
              <AdviceBanner code={unused.code} level={unused.level}
                title={t('loyalty.program.advice.benefit_unused.title', 'No tier gives {{benefits}} yet', { benefits: listOf(unused.benefits.map(x => x.name), i18n.language || 'en') })}
                line={t('loyalty.program.advice.benefit_unused.line', 'Members have a benefit only once a tier gives it. On Tiers, press Add benefit on the tier that should give it.')}>
                <Button size="sm" variant="secondary" onClick={() => go('tiers')}>{t('loyalty.program.advice.go_tiers', 'Go to Tiers')}<ArrowRight size={14} aria-hidden /></Button>
              </AdviceBanner>
            )}
            <ul className="grid gap-2 lg:grid-cols-2">
              {program.benefits.map(b => <BenefitRow key={b.id} benefit={b} tiers={program.tiers} manage={manage} onOpen={onOpen} />)}
            </ul>
          </>
        )}
    </section>
  )
}

/**
 * A catalogue entry: its name, and its category and how it is given in one line, then the tiers that give it (release
 * 10, the owner's Benefit library 163:244: "Included in"), or that none does yet. A manager edits it and switches it on
 * or off with its switch (which shows its state); anyone else sees "Switched off" on one that is.
 */
export function BenefitRow({ benefit: b, tiers, manage, onOpen }: { benefit: Benefit; tiers: Tier[]; manage: boolean; onOpen: (open: Open) => void }) {
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
  const givenBy = tiers.filter(tier => tier.benefits.some(tb => tb.benefit_id === b.id)).map(tier => tier.name)

  return (
    <li data-benefit={b.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-a-border bg-a-surface px-3 py-2.5">
      <span aria-hidden data-hue={b.is_active ? 'rule' : 'off'} className="l-hue-tile inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg">
        <Gift size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className={`truncate font-medium ${b.is_active ? 'text-a-text' : 'text-a-text-2'}`}>{b.name}</p>
        {kind && <p className="truncate text-xs text-a-text-2">{kind}</p>}
        <p data-given-by="" className="truncate text-xs text-a-text-2">
          {givenBy.length > 0
            ? t('loyalty.program.benefits.given_by', 'Given by {{tiers}}', { tiers: givenBy.join(' · ') })
            : t('loyalty.program.benefits.given_by_none', 'No tier gives it yet')}
        </p>
      </div>
      {!manage && !b.is_active && <ToneBadge tone={activeTone(false)}>{t('loyalty.program.switched_off', 'Switched off')}</ToneBadge>}
      {manage && (
        <div className="flex items-center gap-1">
          <IconButton icon={PenLine} label={t('loyalty.program.rename.action', 'Rename')} name={b.name} onClick={() => onOpen({ kind: 'rename_benefit', benefit: b })} />
          <IconButton icon={SlidersHorizontal} label={t('loyalty.program.edit', 'Edit')} name={b.name} onClick={() => onOpen({ kind: 'benefit', benefit: b })} />
          <IconButton icon={Trash2} danger label={t('loyalty.program.remove_benefit.action', 'Delete')} name={b.name} onClick={() => onOpen({ kind: 'remove_benefit', benefit: b })} />
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
    <section aria-labelledby={program.boosts.length > 0 ? 'program-boosts' : undefined} className="space-y-3">
      {program.boosts.length > 0 && (
        <SectionHead id="program-boosts" icon={Zap} hue="gift" title={t('loyalty.program.boosts.title', 'Boost events')}>
          {manage && <Button size="sm" onClick={() => onOpen({ kind: 'boost', boost: null })}><Plus size={15} aria-hidden />{t('loyalty.program.boosts.add', 'Add boost')}</Button>}
        </SectionHead>
      )}
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
        ? (
          <GetStarted name="boosts" hue="gift" optional title={t('loyalty.program.get_started.boosts.title', 'Give members a reason to come back')}
            line={t('loyalty.program.get_started.boosts.line', 'A boost multiplies the points members earn for a set time. Start with a simple double-points weekend.')}
            steps={[
              { title: t('loyalty.program.get_started.boosts.s1_title', 'Name it and choose the multiplier'), line: t('loyalty.program.get_started.boosts.s1_line', '×2 doubles every point earned while it runs.') },
              { title: t('loyalty.program.get_started.boosts.s2_title', 'Set when it runs'), line: t('loyalty.program.get_started.boosts.s2_line', 'Dates and times on your venue’s clock, and the days of the week.') },
              { title: t('loyalty.program.get_started.boosts.s3_title', 'Choose who gets it'), line: t('loyalty.program.get_started.boosts.s3_line', 'Every tier, or only the tiers you pick.') },
            ]}
            action={manage && <Button onClick={() => onOpen({ kind: 'boost', boost: null })}><Plus size={15} aria-hidden />{t('loyalty.program.boosts.add', 'Add boost')}</Button>}
            example={(
              <GetStartedExample hue="gift" title={t('loyalty.program.get_started.boosts.example_title', 'Double-points weekend')}
                figures={t('loyalty.program.get_started.boosts.example_figures', '{{from}} → {{to}} points', { from: points(100, locale), to: points(200, locale) })}
                line={t('loyalty.program.get_started.boosts.example_line', '×2 boost · Saturday and Sunday')} />
            )} />
        )
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
