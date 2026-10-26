import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Award, ChevronRight, Coins, Gift, LayoutGrid, SlidersHorizontal, Sparkles, Tag, WandSparkles, Zap, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { SectionTitle } from '../../workspace/ui/Typography'
import { points } from '../lib/format'
import { GROUP_HUE, groupsOf, type WayGroup } from './groups'
import { OPTIONS_KEY, optionsApi } from './optionsApi'
import { wayFormOf } from './optionsMath'
import { LoadFailed, Loading } from './parts'
import { SetupBanner } from './SetupBanner'
import type { OptionsAnswer, Way } from './types'
import { WayCard } from './WayCard'
import { GROUP_WORDS } from './words'

const GROUP_ICONS: Record<WayGroup, LucideIcon> = { earn: Coins, bonus: Gift, rule: SlidersHorizontal, more: Sparkles }

/** A link that looks like the header's secondary button (Members' own tool style). */
const TOOL = 'inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2'

/**
 * Ways to earn (release 7, spec 2026-10-25 §1): one card per way to earn or be rewarded — whether it is on, what members
 * get with it in a sentence, its numbers — each saved on its own; then the programme's other parts (tiers, rewards,
 * offers, boosts) with how many there are, each opening its own page. Everyone reads it; a manager changes it (the
 * server's `can_change`) — for anyone else nothing is pressable, and the page says why. The cards and their fields are
 * the server's (`ways`, `fields`). Design pass 2026-10-26: the cards sit in three coloured sections (groups.ts) — earn,
 * bonuses, rules — each saying how many of its ways are on, with a row at the top that jumps to each.
 */
export function OptionsPage() {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options })
  const data = query.data

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader title={t('loyalty.options.title', 'Ways to earn')}
        below={data && !data.can_change && (
          <p data-read-only="" className="text-sm text-a-text-2">{t('loyalty.options.read_only', 'Only an owner or a manager can change these. You see them as they are.')}</p>
        )}>
        {data?.can_change && (
          <Link to="/loyalty/options/setup" className={TOOL}><WandSparkles size={15} aria-hidden />{t('loyalty.options.open_wizard', 'Setup wizard')}</Link>
        )}
      </PageHeader>

      <SetupBanner />

      {query.isError && !data && <LoadFailed error={query.error} onRetry={() => { void query.refetch() }} />}
      {!data && query.isLoading && <Loading />}

      {data && (
        <>
          <Sections answer={data} />
          {groupsOf(data.ways).map(({ group, ways }) => (
            <section key={group} id={`ways-${group}`} data-group={group} data-hue={GROUP_HUE[group]} aria-labelledby={`ways-${group}-title`} className="scroll-mt-20 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <GroupMark group={group} />
                <h2 id={`ways-${group}-title`} className="font-a-display text-2xl font-normal text-a-text">{t(`loyalty.options.group.${group}`, GROUP_WORDS[group])}</h2>
                <OnCount ways={ways} answer={data} />
              </div>
              <div className="grid items-start gap-3 xl:grid-cols-2">
                {ways.map(way => <WayCard key={way.key} way={way} answer={data} manage={data.can_change} />)}
              </div>
            </section>
          ))}
          <Parts answer={data} />
        </>
      )}
    </div>
  )
}

/** A section's mark: its icon on its colour. */
function GroupMark({ group }: { group: WayGroup }) {
  const Icon = GROUP_ICONS[group]
  return <span aria-hidden className="l-hue-tile inline-flex h-9 w-9 items-center justify-center rounded-xl"><Icon size={18} /></span>
}

/** How many of a section's ways are on, as their cards read them. */
function OnCount({ ways, answer }: { ways: Way[]; answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const on = ways.filter(way => wayFormOf(way, answer.options, answer.fields).on).length
  return (
    <span data-on-count="" className="rounded-full bg-a-surface px-2.5 py-0.5 text-xs font-semibold tabular-nums text-a-text-2 ring-1 ring-a-border">
      {t('loyalty.options.groups_on', '{{on}} of {{all}} on', { on: points(on, locale), all: points(ways.length, locale) })}
    </span>
  )
}

/** The row at the top: each section in its colour with how many of its ways are on, and the rest of the programme. */
function Sections({ answer }: { answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const groups = groupsOf(answer.ways)
  return (
    <nav aria-label={t('loyalty.options.sections', 'Sections')} className="flex flex-wrap gap-2">
      {groups.map(({ group, ways }) => {
        const on = ways.filter(way => wayFormOf(way, answer.options, answer.fields).on).length
        const Icon = GROUP_ICONS[group]
        return (
          <a key={group} href={`#ways-${group}`} data-hue={GROUP_HUE[group]}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-a-border bg-a-surface py-1.5 pl-1.5 pr-3.5 text-sm font-medium text-a-text hover:bg-a-surface-2">
            <span aria-hidden className="l-hue-tile inline-flex h-7 w-7 items-center justify-center rounded-full"><Icon size={15} /></span>
            {t(`loyalty.options.group.${group}`, GROUP_WORDS[group])}
            <span className="tabular-nums text-xs text-a-text-2">{points(on, locale)}/{points(ways.length, locale)}</span>
          </a>
        )
      })}
      <a href="#options-parts" className="inline-flex min-h-10 items-center gap-2 rounded-full border border-a-border bg-a-surface py-1.5 pl-1.5 pr-3.5 text-sm font-medium text-a-text hover:bg-a-surface-2">
        <span aria-hidden className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-a-surface-2 text-a-text-2"><LayoutGrid size={15} /></span>
        {t('loyalty.options.parts_title', 'The rest of your programme')}
      </a>
    </nav>
  )
}

/** Tiers, rewards, offers and boosts keep their own pages: each card says how many there are and opens its page. */
function Parts({ answer }: { answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const c = answer.catalogue
  return (
    <section id="options-parts" aria-labelledby="options-parts-title" className="scroll-mt-20 space-y-3">
      <SectionTitle><span id="options-parts-title">{t('loyalty.options.parts_title', 'The rest of your programme')}</span></SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Part part="tiers" hue="rule" to="/loyalty/program" icon={Award} count={points(c.tiers, locale)} title={t('loyalty.options.part.tiers', 'Tiers')}
          caption={t('loyalty.options.part.tiers_count', 'In the ladder')} />
        <Part part="rewards" hue="gift" to="/loyalty/rewards" icon={Gift} count={points(c.rewards.length, locale)} title={t('loyalty.options.part.rewards', 'Rewards')}
          caption={t('loyalty.options.part.rewards_count', 'In the catalogue')} />
        <Part part="offers" hue="offer" to="/loyalty/rewards?tab=offers" icon={Tag} count={points(c.offers, locale)} title={t('loyalty.options.part.offers', 'Offers')}
          caption={t('loyalty.options.part.offers_count', 'Switched on')} />
        <Part part="boosts" hue="bonus" to="/loyalty/program" icon={Zap} count={points(c.boosts, locale)} title={t('loyalty.options.part.boosts', 'Boosts')}
          caption={t('loyalty.options.part.boosts_count', 'On now or coming up')} />
      </ul>
    </section>
  )
}

function Part({ part, hue, to, icon: Icon, count, title, caption }: { part: string; hue: string; to: string; icon: LucideIcon; count: string; title: string; caption: string }) {
  return (
    <li data-part={part} data-hue={hue}>
      <Link to={to} className="group flex h-full items-center gap-3 rounded-2xl border border-a-border bg-a-surface p-4 hover:bg-a-surface-2">
        <span aria-hidden className="l-hue-tile inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"><Icon size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-a-text">{title}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-a-display text-2xl font-light tabular-nums leading-tight text-a-text">{count}</span>
            <span className="truncate text-xs text-a-text-2">{caption}</span>
          </span>
        </span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-a-text-2 group-hover:text-a-accent-text" />
      </Link>
    </li>
  )
}
