import { useEffect, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowRight, Award, ChevronRight, CircleCheck, Coins, Gift, Info, LayoutDashboard, Lightbulb, ShieldCheck, SlidersHorizontal,
  Sparkles, Tag, ThumbsUp, WandSparkles, Zap, type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { SectionTitle } from '../../workspace/ui/Typography'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { named } from '../lib/forms'
import { points } from '../lib/format'
import { ERRORS } from './errors'
import { GROUP_HUE, groupOf, groupsOf, pageFrom, searchOf, tabAfter, tabsOf, type OptionsTab, type WayGroup } from './groups'
import { OPTIONS_KEY, afterOptionsChange, optionsApi } from './optionsApi'
import { isOn, sentenceOf, suggestionsOf } from './optionsMath'
import { LoadFailed, Loading, WayIcon } from './parts'
import { useSay, wayTitle } from './say'
import { SetupBanner } from './SetupBanner'
import type { Advice, Options, OptionsAnswer, Way } from './types'
import { WayCard } from './WayCard'
import { ADVICE_WORDS, GROUP_WORDS, PRESET_WORDS } from './words'

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
 * live in the address (`?tab=earn&way=check_in`). The Overview says what the server's checks found (ProgrammeAdvice:
 * what does not work together, each with the card to open), what the venue's own industry's preset would add (one
 * press turns a way on with its numbers), and what members get today.
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
 * The tabs: the Overview (with how many warnings wait, in the waiting colour) and each section in its colour with how
 * many of its ways are on. One tab stop; the arrow keys, Home and End move between the tabs.
 */
function TabBar({ answer, tab, go }: { answer: OptionsAnswer; tab: OptionsTab; go: (tab: OptionsTab) => void }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const tabs = tabsOf(answer.ways)
  const groups = groupsOf(answer.ways)
  const warnings = (answer.advice ?? []).filter(a => a.level === 'warn' && ADVICE_WORDS[a.code]).length

  return (
    <div role="tablist" aria-label={t('loyalty.options.tabs', 'Ways to earn areas')} className="flex flex-wrap gap-2">
      {tabs.map(name => {
        const on = tab === name
        const group = name === 'overview' ? null : groups.find(g => g.group === name)
        const Icon = name === 'overview' ? LayoutDashboard : GROUP_ICONS[name]
        return (
          <button key={name} type="button" role="tab" id={`options-tab-${name}`} aria-selected={on} aria-controls="options-panel" tabIndex={on ? 0 : -1}
            data-hue={name === 'overview' ? undefined : GROUP_HUE[name]} onClick={() => go(name)}
            onKeyDown={(e) => {
              const next = tabAfter(tabs, tab, e.key)
              if (next === null) return
              e.preventDefault()
              go(next)
              document.getElementById(`options-tab-${next}`)?.focus()
            }}
            className={`inline-flex min-h-10 items-center gap-2 rounded-full border py-1.5 pl-1.5 pr-3.5 text-sm font-medium ${on ? 'border-transparent bg-a-accent text-a-accent-ink' : 'border-a-border bg-a-surface text-a-text hover:bg-a-surface-2'}`}>
            <span aria-hidden className={`inline-flex h-7 w-7 items-center justify-center rounded-full ${on ? 'bg-a-accent-ink/20' : name === 'overview' ? 'bg-a-surface-2 text-a-text-2' : 'l-hue-tile'}`}><Icon size={15} /></span>
            <span>{name === 'overview' ? t('loyalty.options.tab_overview', 'Overview') : t(`loyalty.options.group.${name}`, GROUP_WORDS[name])}</span>
            {group && (
              <span data-tab-count="" className={`text-xs tabular-nums ${on ? '' : 'text-a-text-2'}`}>
                {points(onCount(group.ways, answer.options), locale)}/{points(group.ways.length, locale)}
              </span>
            )}
            {name === 'overview' && warnings > 0 && (
              <span data-tab-count="" data-state="pending" className={`rounded-full px-2 text-xs font-bold tabular-nums ${on ? 'bg-a-accent-ink/20' : 'l-st-tint l-st-text'}`}>
                {points(warnings, locale)}<span className="sr-only"> {t('loyalty.options.to_check', 'to check')}</span>
              </span>
            )}
          </button>
        )
      })}
    </div>
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

/**
 * The Overview: the checks and what the industry's preset would add on one side, what members get today on the other,
 * then the rest of the programme.
 */
function Overview({ answer, open }: { answer: OptionsAnswer; open: (way: string) => void }) {
  return (
    <div className="space-y-6">
      <div className="grid items-start gap-4 xl:grid-cols-2">
        <div className="space-y-4">
          <Checks answer={answer} open={open} />
          <Suggestions answer={answer} />
        </div>
        <MembersGet answer={answer} open={open} />
      </div>
      <Parts answer={answer} />
    </div>
  )
}

/** A panel of the Overview: its icon in its colour, its title, then its rows. */
function Panel({ id, icon: Icon, hue, title, children }: { id: string; icon: LucideIcon; hue?: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} data-hue={hue} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
      <h2 id={id} className="flex items-center gap-2.5 font-a-display text-xl font-normal text-a-text">
        <span aria-hidden className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${hue ? 'l-hue-tile' : 'bg-a-surface-2 text-a-text-2'}`}><Icon size={16} /></span>{title}
      </h2>
      {children}
    </section>
  )
}

/** The server's checks: each warning or tip in a sentence, with the card to open for it; or that all is well. */
function Checks({ answer, open }: { answer: OptionsAnswer; open: (way: string) => void }) {
  const { t } = useTranslation()
  const say = useSay()
  const advice = (answer.advice ?? []).filter(a => ADVICE_WORDS[a.code])
  return (
    <Panel id="options-checks" icon={ShieldCheck} hue={advice.some(a => a.level === 'warn') ? 'gift' : 'earn'} title={t('loyalty.options.checks', 'Checks')}>
      {advice.length === 0
        ? (
          <p data-all-good="" data-hue="earn" className="l-hue-wash flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-medium text-a-text">
            <CircleCheck size={16} aria-hidden className="l-hue-text shrink-0" />{t('loyalty.options.all_good', 'Everything works together.')}
          </p>
        )
        : (
          <ul className="space-y-2">
            {advice.map(item => <CheckRow key={item.code} item={item} title={item.way ? wayTitle(say, item.way) : null} open={open} />)}
          </ul>
        )}
    </Panel>
  )
}

function CheckRow({ item, title, open }: { item: Advice; title: string | null; open: (way: string) => void }) {
  const { t } = useTranslation()
  const words = named('loyalty.options.advice', ADVICE_WORDS, item.code)
  const warn = item.level === 'warn'
  const Icon = warn ? AlertTriangle : Lightbulb
  return (
    <li data-advice={item.code} data-level={item.level} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-a-surface-2 px-3.5 py-3">
      <span aria-hidden data-state={warn ? 'pending' : 'approved'} className="l-st-tint l-st-text inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"><Icon size={16} /></span>
      <p className="min-w-[12rem] flex-1 text-sm text-a-text">{words ? t(...words, { ...Object.fromEntries(Object.entries(item.params).map(([k, v]) => [k, String(v)])) }) : item.code}</p>
      {item.way && title
        ? (
          <Button size="sm" variant="secondary" onClick={() => open(item.way!)}>
            {t('loyalty.options.open_way', 'Open {{way}}', { way: title })}<ArrowRight size={14} aria-hidden />
          </Button>
        )
        : item.code === 'no_rewards' && (
          <Link to="/loyalty/rewards" className="inline-flex items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
            {t('loyalty.options.open_rewards', 'Open Rewards')}<ArrowRight size={14} aria-hidden />
          </Link>
        )}
    </li>
  )
}

/**
 * What the venue's own industry's preset would add: each way it switches on that is off here, with what members would
 * get, and — for a manager — Turn on, which saves the preset's numbers for that way alone.
 */
function Suggestions({ answer }: { answer: OptionsAnswer }) {
  const { t } = useTranslation()
  const found = suggestionsOf(answer)
  if (!found) return null
  const presetName = named('loyalty.options.preset', PRESET_WORDS, found.preset.key)
  return (
    <Panel id="options-suggested" icon={ThumbsUp} hue="offer"
      title={t('loyalty.options.recommended', 'Recommended for {{preset}}', { preset: presetName ? t(...presetName) : found.preset.label })}>
      <ul className="space-y-2">
        {found.ways.map(s => <SuggestionRow key={s.way.key} way={s.way} changes={s.changes} preview={s.preview} answer={answer} />)}
      </ul>
    </Panel>
  )
}

function SuggestionRow({ way, changes, preview, answer }: { way: Way; changes: Options; preview: Options; answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const say = useSay()
  const client = useQueryClient()
  const currency = useBoot().venue.currency
  const turnOn = useMutation({ mutationFn: () => optionsApi.save(changes), onSuccess: (next) => afterOptionsChange(client, next) })
  const failure = turnOn.isError ? failureOf(turnOn.error) : null
  const title = wayTitle(say, way.key)
  const text = sentenceOf(way.key, preview, { say, currency, locale: i18n.language || 'en', rewards: answer.catalogue.rewards })
  return (
    <li data-suggest={way.key} className="space-y-2 rounded-xl bg-a-surface-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <WayIcon way={way.key} on />
        <div className="min-w-[12rem] flex-1">
          <p className="font-medium text-a-text">{title}</p>
          <p className="text-sm text-a-text-2">{text}</p>
        </div>
        {answer.can_change && (
          <Button size="sm" loading={turnOn.isPending} onClick={() => turnOn.mutate()}>
            {t('loyalty.options.turn_on', 'Turn on')}<span className="sr-only"> {title}</span>
          </Button>
        )}
      </div>
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', failure))}</Notice>}
    </li>
  )
}

/** What members get today: each way that is on in its sentence, then the ways switched off; each opens its card. */
function MembersGet({ answer, open }: { answer: OptionsAnswer; open: (way: string) => void }) {
  const { t, i18n } = useTranslation()
  const say = useSay()
  const currency = useBoot().venue.currency
  const ctx = { say, currency, locale: i18n.language || 'en', rewards: answer.catalogue.rewards }
  const unused = new Set(answer.not_used ?? [])
  const on = answer.ways.filter(way => isOn(way, answer.options))
  const off = answer.ways.filter(way => !isOn(way, answer.options))
  return (
    <Panel id="options-members-get" icon={Sparkles} hue="earn" title={t('loyalty.options.members_get', 'What members get')}>
      <ul className="divide-y divide-a-border">
        {on.map(way => (
          <li key={way.key} data-gets={way.key}>
            <button type="button" onClick={() => open(way.key)} className="group flex w-full items-center gap-3 py-2.5 text-left">
              <WayIcon way={way.key} on={!unused.has(way.key)} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-a-text">
                  {wayTitle(say, way.key)}
                  {unused.has(way.key) && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-a-surface-2 px-2 py-0.5 text-xs font-semibold text-a-text-2">
                      <Info size={12} aria-hidden />{t('loyalty.options.not_used_short', 'Not used here')}
                    </span>
                  )}
                </span>
                <span className="block text-sm text-a-text-2">{sentenceOf(way.key, answer.options, ctx)}</span>
              </span>
              <ChevronRight size={16} aria-hidden className="shrink-0 text-a-text-2 group-hover:text-a-accent-text" />
            </button>
          </li>
        ))}
      </ul>
      {off.length > 0 && (
        <div className="space-y-2 border-t border-a-border pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-a-text-2">{t('loyalty.options.switched_off', 'Switched off')}</p>
          <div className="flex flex-wrap gap-2">
            {off.map(way => (
              <button key={way.key} type="button" data-off={way.key} onClick={() => open(way.key)}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-a-border bg-a-surface px-3 py-1.5 text-sm font-medium text-a-text-2 hover:bg-a-surface-2 hover:text-a-text">
                {wayTitle(say, way.key)}
              </button>
            ))}
          </div>
        </div>
      )}
    </Panel>
  )
}

/** Tiers, rewards, offers and boosts keep their own pages: each card says how many there are and opens its page. */
function Parts({ answer }: { answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const c = answer.catalogue
  return (
    <section id="options-parts" aria-labelledby="options-parts-title" className="space-y-3">
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
