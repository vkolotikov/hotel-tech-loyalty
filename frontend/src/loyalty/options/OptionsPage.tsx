import { useEffect } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Coins, Gift, LayoutDashboard, SlidersHorizontal, Sparkles, WandSparkles, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { points } from '../lib/format'
import { GROUP_HUE, groupOf, groupsOf, pageFrom, searchOf, tabsOf, type OptionsTab, type WayGroup } from './groups'
import { OPTIONS_KEY, optionsApi } from './optionsApi'
import { isOn } from './optionsMath'
import { LoadFailed, Loading } from './parts'
import { SetupBanner } from './SetupBanner'
import type { Options, OptionsAnswer, Way } from './types'
import { WayCard } from './WayCard'
import { Overview } from './Overview'
import { ADVICE_WORDS, GROUP_WORDS, TAB_CAPTION_WORDS } from './words'
import { SectionCards, SectionCount } from '../ui/SectionCards'

const GROUP_ICONS: Record<WayGroup, LucideIcon> = { earn: Coins, bonus: Gift, rule: SlidersHorizontal, more: Sparkles }

/** A link that looks like the header's secondary button (Members' own tool style). */
const TOOL = 'inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2'

/**
 * Ways to earn (release 7, spec 2026-10-25 §1): one card per way to earn or be rewarded — whether it is on, what members
 * get with it in a sentence, its numbers — each saved on its own. Everyone reads it; a manager changes it (the server's
 * `can_change`) — for anyone else nothing is pressable, and the page says why. The cards and their fields are the
 * server's (`ways`, `fields`).
 *
 * Owner 2026-10-26 ("easier to manage … in industry … additional tabs or buttons, better logic"): tabs — an Overview,
 * then Earn points, Bonuses and Rules (groups.ts), each with how many of its ways are on; the tab and an opened card
 * live in the address (`?tab=earn&way=check_in`). The Overview (Overview.tsx) says where the programme stands, what
 * the server's checks found with their one-press fixes, and the member's journey step by step.
 */
export function OptionsPage() {
  const { t } = useTranslation()
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options })
  const data = query.data
  const location = useLocation()
  const navigate = useNavigate()
  const { tab, way: focus } = pageFrom(location.search, data?.ways ?? [])
  const go = (next: OptionsTab, way?: string | null) => navigate({ pathname: '/loyalty/options', search: searchOf(next, way) }, { replace: true })
  const open = (way: string) => go(groupOf(way), way)

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <PageHeader stacked title={t('loyalty.options.title', 'Ways to earn')}
        line={t('loyalty.options.line', 'How members earn points, the bonuses they are given, and the rules that keep it fair.')}
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
          <TabBar answer={data} tab={tab} go={go} />
          <div id="options-panel" role="tabpanel" aria-labelledby={`options-tab-${tab}`}>
            {tab === 'overview'
              ? <Overview answer={data} open={open} />
              : <Section answer={data} group={tab} focus={focus} />}
          </div>
        </>
      )}
    </div>
  )
}

/** How many of these ways are on, as their cards read them. */
const onCount = (ways: Way[], options: Options) => ways.filter(way => isOn(way, options)).length

/**
 * The sections as cards (release 10, the owner's Figma 171:401): the Overview (with how many warnings wait, in the
 * waiting colour) and each section in its colour with a line of what it holds and how many of its ways are on.
 */
function TabBar({ answer, tab, go }: { answer: OptionsAnswer; tab: OptionsTab; go: (tab: OptionsTab) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const groups = groupsOf(answer.ways)
  const warnings = (answer.advice ?? []).filter(a => a.level === 'warn' && ADVICE_WORDS[a.code]).length

  return (
    <SectionCards label={t('loyalty.options.tabs', 'Ways to earn areas')} idPrefix="options-tab" panelId="options-panel" value={tab} onChange={go}
      items={tabsOf(answer.ways).map(name => {
        const group = name === 'overview' ? null : groups.find(g => g.group === name)
        return {
          id: name,
          icon: name === 'overview' ? LayoutDashboard : GROUP_ICONS[name],
          hue: name === 'overview' ? 'tier' : GROUP_HUE[name],
          title: name === 'overview' ? t('loyalty.options.tab_overview', 'Overview') : t(`loyalty.options.group.${name}`, GROUP_WORDS[name]),
          caption: t(`loyalty.options.tab_caption.${name}`, TAB_CAPTION_WORDS[name]),
          badge: group
            ? <SectionCount value={`${points(onCount(group.ways, answer.options), locale)}/${points(group.ways.length, locale)}`} />
            : warnings > 0 ? <SectionCount waiting value={points(warnings, locale)} waitingLabel={t('loyalty.options.to_check', 'to check')} /> : undefined,
        }
      })} />
  )
}

/** A section's tab: its cards, the one the address names opened and brought into view. */
function Section({ answer, group, focus }: { answer: OptionsAnswer; group: OptionsTab; focus: string | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const ways = groupsOf(answer.ways).find(g => g.group === group)?.ways ?? []
  useEffect(() => {
    if (focus) document.getElementById(`way-${focus}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [focus])
  if (group === 'overview') return null
  const Icon = GROUP_ICONS[group]

  return (
    <section data-group={group} data-hue={GROUP_HUE[group]} aria-labelledby={`ways-${group}-title`} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className="l-hue-tile inline-flex h-9 w-9 items-center justify-center rounded-xl"><Icon size={18} /></span>
        <h2 id={`ways-${group}-title`} className="font-a-display text-2xl font-normal text-a-text">{t(`loyalty.options.group.${group}`, GROUP_WORDS[group])}</h2>
        <span data-on-count="" className="rounded-full bg-a-surface px-2.5 py-0.5 text-xs font-semibold tabular-nums text-a-text-2 ring-1 ring-a-border">
          {t('loyalty.options.groups_on', '{{on}} of {{all}} on', { on: points(onCount(ways, answer.options), locale), all: points(ways.length, locale) })}
        </span>
      </div>
      <div className="grid items-start gap-3 xl:grid-cols-2">
        {/* Keyed by the focus too: a card the address opens starts open even when it was already on screen. */}
        {ways.map(way => <WayCard key={`${way.key}-${focus === way.key}`} way={way} answer={answer} manage={answer.can_change} defaultOpen={focus === way.key} />)}
      </div>
    </section>
  )
}
