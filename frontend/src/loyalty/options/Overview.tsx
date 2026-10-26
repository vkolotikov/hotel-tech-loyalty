import { Fragment } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  AlertTriangle, ArrowRight, Award, Cake, ChevronRight, CircleCheck, Coins, Gift, Hourglass, Lightbulb, Tag, ThumbsUp, TrendingUp, UserPlus, Users, Wand2, Zap,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '../../workspace/ui/Button'
import { Notice } from '../../workspace/ui/Notice'
import { useBoot } from '../LoyaltyProvider'
import { failureOf } from '../lib/api'
import { refusalKey } from '../lib/errors'
import { named } from '../lib/forms'
import { points } from '../lib/format'
import { ERRORS } from './errors'
import { PART_TO, STAGE_HUE, partCount, stepLive, stepsOf, type PartId, type StageId } from './journey'
import { afterOptionsChange, optionsApi } from './optionsApi'
import { isOn, sentenceOf, suggestionsOf } from './optionsMath'
import { WayIcon } from './parts'
import { useSay, wayTitle } from './say'
import type { Advice, Options, OptionsAnswer, Way } from './types'
import { ADVICE_WORDS, FIX_WORDS, PRESET_WORDS, STAGE_WORDS } from './words'

const STAGE_ICONS: Record<StageId, LucideIcon> = {
  join: UserPlus, visit: Coins, celebrate: Cake, friends: Users, move_up: TrendingUp, spend: Gift, keep: Hourglass,
}
const PART_ICONS: Record<PartId, LucideIcon> = { tiers: Award, rewards: Gift, offers: Tag, boosts: Zap }
const PART_HUE: Record<PartId, string> = { tiers: 'rule', rewards: 'gift', offers: 'offer', boosts: 'bonus' }

/**
 * Ways to earn's Overview (owner 2026-10-26: "easier to navigate … build a logic"): where the programme stands in one
 * line — all set, or how many things to fix — with its figures; then the server's checks, each with its one-press fix
 * (ProgrammeAdvice's `fix`, saved like any change) and the card to open; then the member's journey (journey.ts): a map
 * of the steps, and each step with its ways — on or off, what members get, the ones the venue's industry recommends
 * with Turn on — and the parts of the programme it leads to. A way opens its card in its tab.
 */
export function Overview({ answer, open }: { answer: OptionsAnswer; open: (way: string) => void }) {
  const found = suggestionsOf(answer)
  const recommended = new Map((found?.ways ?? []).map(s => [s.way.key, s.changes]))
  return (
    <div className="space-y-6">
      <Status answer={answer} recommended={recommended.size} preset={found?.preset ?? null} />
      <Checks answer={answer} open={open} />
      <Journey answer={answer} recommended={recommended} open={open} />
    </div>
  )
}

/** The words of the checks the workspace can say (a code without words is not shown, nor counted). */
const sayable = (answer: OptionsAnswer) => (answer.advice ?? []).filter(a => ADVICE_WORDS[a.code])

/** Where the programme stands: all set, or how many things to fix; then its figures. */
function Status({ answer, recommended, preset }: { answer: OptionsAnswer; recommended: number; preset: { key: string; label: string } | null }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const advice = sayable(answer)
  const warnings = advice.filter(a => a.level === 'warn').length
  const tips = advice.length - warnings
  const on = answer.ways.filter(way => isOn(way, answer.options)).length
  const presetName = preset ? named('loyalty.options.preset', PRESET_WORDS, preset.key) : null
  const Icon = warnings > 0 ? AlertTriangle : CircleCheck
  const pills = [
    t('loyalty.options.pill_on', 'Ways on: {{on}} of {{all}}', { on: points(on, locale), all: points(answer.ways.length, locale) }),
    t('loyalty.options.pill_tiers', 'Tiers: {{n}}', { n: points(answer.catalogue.tiers, locale) }),
    t('loyalty.options.pill_rewards', 'Rewards: {{n}}', { n: points(answer.catalogue.rewards.length, locale) }),
    ...(tips > 0 ? [t('loyalty.options.pill_tips', 'Tips: {{n}}', { n: points(tips, locale) })] : []),
  ]
  return (
    <section data-status={warnings > 0 ? 'fix' : 'ok'} data-hue={warnings > 0 ? 'gift' : 'earn'} aria-labelledby="options-status"
      className="flex flex-wrap items-center gap-4 rounded-2xl border border-a-border bg-a-surface p-4 sm:p-5">
      <span aria-hidden className="l-hue-tile inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"><Icon size={24} /></span>
      <div className="min-w-[12rem] flex-1 space-y-2">
        <h2 id="options-status" className="font-a-display text-2xl font-normal text-a-text">
          {warnings > 0 ? t('loyalty.options.status_fix', 'To fix: {{n}}', { n: points(warnings, locale) }) : t('loyalty.options.status_ok', 'All set')}
        </h2>
        <ul className="flex flex-wrap gap-2">
          {pills.map(text => <li key={text} className="rounded-full bg-a-surface-2 px-3 py-1 text-xs font-semibold tabular-nums text-a-text-2">{text}</li>)}
          {recommended > 0 && preset && (
            <li data-hue="offer" className="l-hue-tile inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold tabular-nums">
              <ThumbsUp size={12} aria-hidden />
              {t('loyalty.options.pill_recommended', 'Recommended for {{preset}}: {{n}}', { preset: presetName ? t(...presetName) : preset.label, n: points(recommended, locale) })}
            </li>
          )}
        </ul>
      </div>
    </section>
  )
}

/** The checks, warnings first: each in a sentence, with its one-press fix (a manager's) and the card to open. */
function Checks({ answer, open }: { answer: OptionsAnswer; open: (way: string) => void }) {
  const { t } = useTranslation()
  const advice = sayable(answer)
  if (advice.length === 0) return null
  return (
    <section aria-labelledby="options-checks" className="space-y-3">
      <h2 id="options-checks" className="font-a-display text-xl font-normal text-a-text">{t('loyalty.options.checks', 'Checks')}</h2>
      <ul className="grid gap-2 xl:grid-cols-2">
        {advice.map(item => <CheckRow key={item.code} item={item} answer={answer} open={open} />)}
      </ul>
    </section>
  )
}

function CheckRow({ item, answer, open }: { item: Advice; answer: OptionsAnswer; open: (way: string) => void }) {
  const { t } = useTranslation()
  const say = useSay()
  const client = useQueryClient()
  const fix = useMutation({ mutationFn: (options: Options) => optionsApi.save(options), onSuccess: (next) => afterOptionsChange(client, next) })
  const failure = fix.isError ? failureOf(fix.error) : null
  const words = named('loyalty.options.advice', ADVICE_WORDS, item.code)
  const vars = Object.fromEntries(Object.entries(item.params).map(([k, v]) => [k, String(v)]))
  const title = item.way ? wayTitle(say, item.way) : null
  const warn = item.level === 'warn'
  const Icon = warn ? AlertTriangle : Lightbulb
  const fixWords = item.fix && answer.can_change ? named('loyalty.options.fix', FIX_WORDS, item.code) : null
  const fixVars = {
    way: title ?? '',
    points: String(item.fix?.referrer_bonus_points ?? item.fix?.checkin_points ?? ''),
    months: String(item.fix?.points_expiry_months ?? ''),
  }

  return (
    <li data-advice={item.code} data-level={item.level} className="space-y-3 rounded-2xl border border-a-border bg-a-surface p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden data-state={warn ? 'pending' : 'approved'} className="l-st-tint l-st-text inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"><Icon size={17} /></span>
        <p className="min-w-0 flex-1 self-center text-sm text-a-text">{words ? t(...words, vars) : item.code}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 pl-12">
        {fixWords && item.fix && (
          <Button size="sm" loading={fix.isPending} onClick={() => fix.mutate(item.fix!)}>
            <Wand2 size={14} aria-hidden />{t(...fixWords, fixVars)}
          </Button>
        )}
        {item.way && title && (
          <Button size="sm" variant="secondary" onClick={() => open(item.way!)}>
            {t('loyalty.options.open_way', 'Open {{way}}', { way: title })}<ArrowRight size={14} aria-hidden />
          </Button>
        )}
        {item.code === 'no_rewards' && (
          <Link to="/loyalty/rewards" className="inline-flex items-center gap-1.5 rounded-full border border-a-border bg-a-surface px-3 py-1.5 text-sm font-semibold text-a-text hover:bg-a-surface-2">
            {t('loyalty.options.open_rewards', 'Open Rewards')}<ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
      {failure && <Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', failure))}</Notice>}
    </li>
  )
}

/**
 * The member's journey: a map of the steps (each in its colour while it gives members something, grey while it does
 * not; each jumps to its step), then the steps on a line, each with its ways and the parts it leads to.
 */
function Journey({ answer, recommended, open }: { answer: OptionsAnswer; recommended: Map<string, Options>; open: (way: string) => void }) {
  const { t } = useTranslation()
  const steps = stepsOf(answer.ways)
  return (
    <section aria-labelledby="options-journey" className="space-y-4">
      <h2 id="options-journey" className="font-a-display text-xl font-normal text-a-text">{t('loyalty.options.journey', 'Your members’ journey')}</h2>
      <nav aria-label={t('loyalty.options.journey_map', 'Journey steps')} className="-mx-4 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        <ol className="flex min-w-max items-start">
          {steps.map((step, i) => {
            const Icon = STAGE_ICONS[step.stage]
            const live = stepLive(step, answer)
            return (
              <Fragment key={step.stage}>
                {i > 0 && <li aria-hidden className="mt-5 h-0.5 w-6 shrink-0 rounded-full bg-a-border sm:w-10" />}
                <li>
                  {/* A button that scrolls, never a "#…" link: under the app's <base href="/"> that would leave the workspace. */}
                  <button type="button" data-map={step.stage} data-live={live ? '' : undefined} data-hue={live ? STAGE_HUE[step.stage] : 'off'}
                    onClick={() => document.getElementById(`step-${step.stage}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="flex w-20 flex-col items-center gap-1.5 rounded-xl px-1 py-1 text-center hover:bg-a-surface-2 sm:w-24">
                    <span aria-hidden className={`l-hue-tile inline-flex h-11 w-11 items-center justify-center rounded-full ${live ? '' : 'border border-dashed border-a-border'}`}><Icon size={19} /></span>
                    <span className={`text-xs font-medium leading-tight ${live ? 'text-a-text' : 'text-a-text-2'}`}>{t(`loyalty.options.stage.${step.stage}`, STAGE_WORDS[step.stage])}</span>
                  </button>
                </li>
              </Fragment>
            )
          })}
        </ol>
      </nav>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const Icon = STAGE_ICONS[step.stage]
          const live = stepLive(step, answer)
          return (
            <li key={step.stage} id={`step-${step.stage}`} data-step={step.stage} className="grid scroll-mt-20 grid-cols-[2.75rem_minmax(0,1fr)] gap-3">
              <div className="flex flex-col items-center">
                <span aria-hidden data-hue={live ? STAGE_HUE[step.stage] : 'off'} className="l-hue-tile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full"><Icon size={19} /></span>
                {i < steps.length - 1 && <span aria-hidden className="mt-2 w-0.5 flex-1 rounded-full bg-a-border" />}
              </div>
              <div className="space-y-2 rounded-2xl border border-a-border bg-a-surface p-3 sm:p-4">
                <h3 className="flex items-center gap-2 text-base font-semibold text-a-text">
                  <span className="tabular-nums text-a-text-2">{i + 1}.</span>{t(`loyalty.options.stage.${step.stage}`, STAGE_WORDS[step.stage])}
                </h3>
                <ul className="grid gap-2 lg:grid-cols-2">
                  {step.ways.map(way => <WayRow key={way.key} way={way} answer={answer} turnOn={recommended.get(way.key) ?? null} open={open} />)}
                  {step.parts.map(part => <PartRow key={part} part={part} answer={answer} />)}
                </ul>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

/** A way at its step: what members get with it today (or that it is off), and Turn on where the industry recommends it. */
function WayRow({ way, answer, turnOn, open }: { way: Way; answer: OptionsAnswer; turnOn: Options | null; open: (way: string) => void }) {
  const { t, i18n } = useTranslation()
  const say = useSay()
  const client = useQueryClient()
  const currency = useBoot().venue.currency
  const save = useMutation({ mutationFn: (options: Options) => optionsApi.save(options), onSuccess: (next) => afterOptionsChange(client, next) })
  const failure = save.isError ? failureOf(save.error) : null
  const on = isOn(way, answer.options)
  const unused = on && (answer.not_used ?? []).includes(way.key)
  const title = wayTitle(say, way.key)
  const text = sentenceOf(way.key, answer.options, { say, currency, locale: i18n.language || 'en', rewards: answer.catalogue.rewards })
  return (
    <li data-step-way={way.key} data-on={on ? '' : undefined} className={`rounded-xl px-3 py-2.5 ${on ? 'bg-a-surface-2' : 'border border-dashed border-a-border'}`}>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => open(way.key)} className="group flex min-w-[10rem] flex-1 items-center gap-3 text-left">
          <WayIcon way={way.key} on={on && !unused} />
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-a-text">
              {title}
              {!on && <span className="text-xs font-semibold text-a-text-2">· {t('loyalty.options.card.off', 'Off')}</span>}
              {unused && <span className="rounded-full bg-a-surface px-2 py-0.5 text-xs font-semibold text-a-text-2">{t('loyalty.options.not_used_short', 'Not used here')}</span>}
              {turnOn && (
                <span data-hue="offer" className="l-hue-tile inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
                  <ThumbsUp size={11} aria-hidden />{t('loyalty.options.recommended_badge', 'Recommended')}
                </span>
              )}
            </span>
            <span className="block text-sm text-a-text-2">{text}</span>
          </span>
          <ChevronRight size={16} aria-hidden className="shrink-0 text-a-text-2 group-hover:text-a-accent-text" />
        </button>
        {turnOn && answer.can_change && (
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate(turnOn)}>
            {t('loyalty.options.turn_on', 'Turn on')}<span className="sr-only"> {title}</span>
          </Button>
        )}
      </div>
      {failure && <div className="mt-2"><Notice tone="danger">{t(...refusalKey('loyalty.options', ERRORS, 'save', failure))}</Notice></div>}
    </li>
  )
}

/** A part of the programme a step leads to (tiers, rewards, offers, boosts): how many there are, opening its page. */
function PartRow({ part, answer }: { part: PartId; answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const Icon = PART_ICONS[part]
  const words: Record<PartId, [string, string, string, string]> = {
    tiers: ['loyalty.options.part.tiers', 'Tiers', 'loyalty.options.part.tiers_count', 'In the ladder'],
    rewards: ['loyalty.options.part.rewards', 'Rewards', 'loyalty.options.part.rewards_count', 'In the catalogue'],
    offers: ['loyalty.options.part.offers', 'Offers', 'loyalty.options.part.offers_count', 'Switched on'],
    boosts: ['loyalty.options.part.boosts', 'Boosts', 'loyalty.options.part.boosts_count', 'On now or coming up'],
  }
  const [titleKey, title, captionKey, caption] = words[part]
  return (
    <li data-part={part} data-hue={PART_HUE[part]}>
      <Link to={PART_TO[part]} className="group flex h-full items-center gap-3 rounded-xl bg-a-surface-2 px-3 py-2.5 hover:bg-a-surface-2/70">
        <span aria-hidden className="l-hue-tile inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"><Icon size={18} /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-a-text">{t(titleKey, title)}</span>
          <span className="flex items-baseline gap-2">
            <span className="font-a-display text-xl font-light tabular-nums leading-tight text-a-text">{points(partCount(part, answer), i18n.language || 'en')}</span>
            <span className="truncate text-xs text-a-text-2">{t(captionKey, caption)}</span>
          </span>
        </span>
        <ChevronRight size={16} aria-hidden className="shrink-0 text-a-text-2 group-hover:text-a-accent-text" />
      </Link>
    </li>
  )
}
