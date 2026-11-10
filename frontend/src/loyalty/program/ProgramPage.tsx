import { TakeOff } from './TakeOff'
import { useState, type ReactNode } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, CalendarDays, CheckCheck, Gift, Lightbulb, Pencil, PenLine, Plus, SlidersHorizontal, Trash2, Users, X } from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Dialog } from '../../workspace/ui/Dialog'
import { Notice } from '../../workspace/ui/Notice'
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
  activeTone, boostState, boostTone, needsTimeCheck, programActions, programSectionFrom, thresholds, timeCheckList, typedValue, weekdaysText,
} from './programMath'
import { chosenTiers, decimal, named } from '../lib/forms'
import { TierBenefitDialog } from './TierBenefitDialog'
import { TierDialog } from './TierDialog'
import { TierEditorPage } from './TierEditorPage'
import { SideMenu } from '../../workspace/shell/SideMenu'
import { OverviewButton } from '../overview/OverviewUI'
import { useRedesignWords } from '../redesign/words'
import { tierTextStyle } from '../redesign/designMath'
import type { Benefit, Boost, Program, ProgramAdvice, Tier, TierBenefit } from './types'
import { APPLIES_TO_WORDS, BOOST_STATE_WORDS, CATEGORY_WORDS, FULFILLMENT_WORDS, THRESHOLD_WORDS, VALUE_PHRASE_WORDS } from './words'
import { PlacesSection } from '../places/PlacesSection'
import { TierPlaces } from '../places/TierPlaces'
import { Switch } from '../options/parts'
import { GetStarted, GetStartedExample } from '../ui/GetStarted'
import { IconButton } from './parts'
import { RemoveBenefit, RemoveTier, RenameDialog } from './RemoveDialogs'
import { programAssets, levelAssets } from './design/assets'
import { programTierPaint } from './design/programPaint'
import { BoostDirectory } from './design/BoostDirectory'
import './design/program.css'
import { LevelsPage } from '../management/LevelsPage'

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


/**
 * Program: levels and their assignments, places, and boost events. The shared benefit catalogue belongs to Rewards.
 * Existing writers and manager gates remain; the sidebar and tool links choose one section in the address.
 * PG-B01/02/03/06 replace the earlier presentation, while empty sections retain their real first-step actions.
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
  const location = useLocation()
  const navigate = useNavigate()
  const section = programSectionFrom(location.search, location.hash)
  const say = useRedesignWords()
  const editorId = new URLSearchParams(location.search).get('tier')
  const openTier = (tier: Tier | null) => navigate(`/loyalty/program?tab=tiers&tier=${tier?.id ?? 'new'}`)
  const onOpen = (value: Open) => { if (value.kind === 'tier') openTier(value.tier); else setOpen(value) }
  if (new URLSearchParams(location.search).get('tab') === 'benefits') { const next = new URLSearchParams(location.search); next.set('tab', 'benefits'); return <Navigate replace to={{ pathname: '/loyalty/rewards', search: '?' + next.toString() }} /> }
  if (data && section === 'tiers') return <><LevelsPage program={data} manage={manage} />{editorId && <TierEditorPage id={editorId} />}</>

  return (
    <div className={`${section === 'places' ? 'l-ad-page' : 'l-ov-page'} l-rd-page l-pg-clean-page`}>
      {section !== 'places' && <header className="l-ov-page-heading"><div><h1>{section === 'tiers' ? t('loyalty.program.title', 'Program') : t('loyalty.program.boosts.title', 'Boost events')}</h1><p>{say(section === 'tiers' ? 'pgLine' : 'pgBoostLine')}</p></div><div className="l-rd-actions">{section === 'tiers' ? <>{manage && <Link className="l-ov-button" to="/loyalty/program/setup">{say('guidedSetup')}</Link>}{manage && !!data?.tiers.length && <OverviewButton primary onClick={() => openTier(null)}>{say('addLevel')}</OverviewButton>}</> : <><Link className="l-ov-button" to="/loyalty/program?tab=tiers&settings=qualification">{say('qualificationRules')}</Link>{manage && !!data?.boosts.length && <OverviewButton primary onClick={() => setOpen({ kind: 'boost', boost: null })}>+ {t('loyalty.program.boosts.add', 'Add boost')}</OverviewButton>}</>}</div></header>}
      {!manage && <p data-read-only="">{t('loyalty.program.read_only', 'Only an owner or a manager can change the programme.')}</p>}
      {section === 'tiers' && <section className="l-pg-flow"><div>{[[programAssets.points, say(boot.programme.progress_by === 'visits' ? 'pgEarnVisits' : boot.programme.progress_by === 'spend' ? 'pgEarnSpend' : 'pgEarnPoints')], [programAssets.levels, say('pgReach')], [programAssets.gift, say('pgUnlock')]].map(([icon, label], i) => <span key={label}><span className="l-pg-icon"><img src={icon} alt="" /></span>{label}{i < 2 && <span className="l-pg-flow-arrow" aria-hidden>→</span>}</span>)}</div><Link className="l-ov-link" to="/loyalty/program?tab=tiers&settings=qualification">{say('qualificationRules')}</Link><small>{say('pgQualNote')}</small></section>}

      <div id="program-panel" className="space-y-5">

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

        {data && section === 'tiers' && <Tiers program={data} manage={manage} theme={look.resolved} locale={locale} onOpen={onOpen} />}
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

// ─── Tiers ─────────────────────────────────────────────────────────────────

function Tiers({ program, manage, theme, locale, onOpen }: {
  program: Program; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void
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
    <div className="l-rd-levels-head"><h2 id="program-tiers">{say('levels')}</h2><small>{say('levelsCount', { levels: points(program.tiers.filter(tier => tier.is_active).length, locale), members: points(program.tiers.reduce((n, tier) => n + tier.members, 0), locale) })}</small></div>
    <ol className="l-rd-level-grid" aria-label={t('loyalty.program.tiers.ladder', 'The ladder, from the first tier up')}>{program.tiers.map((tier, i) => <TierCard key={tier.id} tier={tier} step={i + 1} last={i === program.tiers.length - 1} manage={manage} theme={theme} locale={locale} onOpen={onOpen} />)}</ol>
    <section className="l-pg-tools"><h2>{say('pgTools')}</h2><div><Link to="/loyalty/program?tab=places"><span className="l-pg-icon"><img src={programAssets.places} alt="" /></span><span><strong>{say('pgPlacesTitle')}</strong><small>{say('pgPlacesCaption')}</small></span><span aria-hidden>→</span></Link><Link to="/loyalty/options?tab=bonus"><span className="l-pg-icon" data-tone="green"><img src={programAssets.calendar} alt="" /></span><span><strong>{t('loyalty.program.boosts.title', 'Boost events')}</strong><small>{say('pgBoostCaption')}</small></span><span aria-hidden>→</span></Link></div></section>
  </section>
}

/** PG-01 uses actual floors, member counts and included benefits; the complete ladder remains available. */
export function TierCard({ tier, step, manage, theme, locale, onOpen }: {
  tier: Tier; step: number; last: boolean; manage: boolean; theme: ThemeName; locale: string; onOpen: (open: Open) => void
}) {
  const { t } = useTranslation()
  const say = useRedesignWords()
  const boot = useBoot()
  const [all, setAll] = useState(false)
  const by = boot.programme.progress_by ?? 'points'
  const floors = thresholds(tier, by)
  const paint = programTierPaint(tier.color, theme), art = levelAssets[paint.tone]
  return <li data-tier={tier.id} className="l-rd-tier-card" style={paint.style}>
    <header><span className="l-pg-tier-icon"><img src={art.card} alt="" /></span><h2 className="l-rd-tier-text" style={tierTextStyle(tier.color)}>{tier.name}</h2><small className="l-pg-pill" data-tone={tier.is_active ? step === 1 ? 'entry' : 'green' : 'neutral'}><img src={tier.is_active && step > 1 ? programAssets.activeDot : programAssets.entryDot} alt="" />{say(!tier.is_active ? 'off' : step === 1 ? 'pgEntry' : 'active')}</small></header>
    <div className="l-rd-tier-body">
      <div className="l-pg-tier-metrics"><dl className="l-rd-tier-floors">{floors.map(th => <div key={th.kind}><dd>{th.value === null ? t('loyalty.program.threshold.not_set', 'Not set') : th.kind === 'spend' ? money(th.value, boot.venue.currency, locale) : points(th.value, locale)}</dd><dt>{t(`loyalty.program.threshold.${th.kind}`, THRESHOLD_WORDS[th.kind])}</dt></div>)}</dl>
      <div className="l-rd-tier-rate"><span>{t('loyalty.program.tiers.earn_rate', 'Earn rate')}</span><strong>×{decimal(tier.earn_rate, locale)}</strong></div></div>
      <Link className="l-ov-link l-pg-tier-members" to={`/loyalty?tier=${tier.id}`}><img src={art.members} alt="" />{say('membersTotal', { n: points(tier.members, locale) })} →</Link>
      <hr /><strong>{say('includedBenefits')}</strong>
      <ul className="l-rd-included-benefits">{(all ? tier.benefits : tier.benefits.slice(0, 3)).map(tb => <li key={tb.id}>✓ {tb.name}</li>)}</ul>
      {!all && <button className="l-ov-link self-start" onClick={() => setAll(true)}>{tier.benefits.length > 3 ? say('moreBenefits', { n: tier.benefits.length - 3 }) : say('details')}</button>}
      {!tier.benefits.length && <p>{t('loyalty.program.tiers.no_benefits', 'This tier gives no benefit yet.')}</p>}
      {all && <><TierPlaces tierId={tier.id} />{tier.description && <small>{tier.description}</small>}<ul className="l-rd-included-benefit-details">{tier.benefits.map(tb => <BenefitChip key={tb.id} tb={tb} tier={tier} manage={manage} locale={locale} onOpen={onOpen} />)}</ul><button className="l-ov-link self-start" onClick={() => setAll(false)}>{t('loyalty.scan.close', 'Close')}</button></>}
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
export { TakeOff } from './TakeOff'

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
      <div className="min-w-56 flex-1">
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
          <BoostDirectory program={program} manage={manage} theme={theme} locale={locale} timeZone={timeZone} onEdit={boost => onOpen({ kind: 'boost', boost })} onRemove={boost => onOpen({ kind: 'remove_boost', boost })} />
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
export function RemoveBoost({ boost, onClose }: { boost: Boost; onClose: () => void }) {
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
