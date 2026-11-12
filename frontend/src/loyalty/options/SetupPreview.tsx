import { ManagementVisual, ManagementOutcome } from '../management/ManagementUI'
import { useAdminWords } from '../management/words'
import { setupJourney } from '../management/setupJourney'
import { points, money } from '../lib/format'
import { useQuery } from '@tanstack/react-query'
import { CATALOGUE_KEY, rewardsApi } from '../rewards/api'
import { rewardStatus } from '../rewards/design/math'
import { ArrowRight, Coins, Crown, Gift, SlidersHorizontal, UserRoundPlus } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSettingsWords } from '../settings/words'
import { WayIcon } from './parts'
import { GROUP_HUE, groupsOf } from './groups'
import { keepsTiers, optionsOfForm, presetOf, reviewOf, sentenceOf, type OptionsForm, type SayContext } from './optionsMath'
import { presetLine, presetName } from './presetPresentation'
import { wayTitle } from './say'
import type { OptionsAnswer } from './types'
import { GROUP_WORDS, PREVIEW_WORDS, PROGRESS_BY_WORDS } from './words'
import './setup-preview.css'

/** An expanded explanation of the actual draft; selecting an industry never invents replacement catalogue data. */
export function SetupPreview({ answer, choice, form, ctx }: { answer: OptionsAnswer; choice: string; form: OptionsForm; ctx: SayContext }) {
  const { t } = useTranslation(), design = useSettingsWords(), admin = useAdminWords()
  const body = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const animation = body.current?.animate?.([{ opacity: .6, transform: 'translateY(3px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 220, easing: 'ease-out' })
    return () => animation?.cancel()
  }, [choice])
  const say = (key: keyof typeof PREVIEW_WORDS, vars?: Record<string, string>) => t(`loyalty.options.preview.${key}`, PREVIEW_WORDS[key], vars ?? {})
  const preset = presetOf(answer, choice), preserved = keepsTiers(answer) || !preset
  const review = reviewOf(answer, form, answer.options, ctx)
  const effective = { ...answer.options, ...optionsOfForm(answer, form) }
  const catalogue = useQuery({ queryKey: CATALOGUE_KEY, queryFn: rewardsApi.catalogue })
  const journey = setupJourney(answer, form, catalogue.data?.rewards.filter(r => rewardStatus(r) === 'active') ?? [])
  const levels = preserved ? answer.catalogue.tiers : preset.tier_count
  const rewards = preserved ? answer.catalogue.rewards.length : preset.reward_count
  const examples = preserved ? answer.catalogue.rewards.slice(0, 2).map(reward => reward.name) : preset.sample_rewards
  return <aside className="l-gs-preview" data-setup-preview="" aria-label={say('title')}>
    <h2>{say('title')}</h2>
    <div ref={body} className="l-gs-preview-content" key={choice} data-preview-template={preset?.key ?? 'keep'}>
      <ManagementVisual art="setupArt" label={admin('programGlance')} title={preset ? presetName(ctx.say, preset) : say('current')} line={preset ? preserved ? say('templateLine') : presetLine(ctx.say, preset) : say('currentLine')} />
      <ol className="l-gs-preview-journey" data-member-journey="" aria-label={say('journey')}>
        {([{ key: 'join', Icon: UserRoundPlus, hue: 'tier' }, { key: 'earn', Icon: Coins, hue: 'earn' }, { key: 'use', Icon: Gift, hue: 'gift' }] as const).map(({ key, Icon, hue }, index) => <li key={key}>
          <span className="l-hue-tile" data-hue={hue} aria-hidden><Icon size={19} /></span><span>{say(key)}</span><strong>{key === 'join' ? `+${points(journey.welcome, ctx.locale)}` : key === 'earn' ? `+${points(journey.spend, ctx.locale)}` : journey.reward ? points(journey.reward.points_cost, ctx.locale) : '—'}</strong>{index < 2 && <ArrowRight className="l-gs-journey-arrow" size={14} aria-hidden />}
        </li>)}
      </ol>
      <p className="l-ad-muted">{admin('baseExample')} · {money(50, ctx.currency, ctx.locale)} · {admin('basePoints')}</p>
      {journey.reward ? <div className="l-ad-inset"><strong>{admin('firstReward')}</strong><ManagementOutcome label={journey.reward.name} from={admin('pointsShort', { n: points(journey.reward.points_cost, ctx.locale) })} to={admin('pointsLeft', { n: points(journey.remaining ?? 0, ctx.locale) })} /></div> : preserved && catalogue.isSuccess ? <p>{admin('noReward')}</p> : null}
      <section className="l-gs-preview-section" data-preview-group="membership" data-catalogue={preserved ? 'preserved' : 'suggested'}>
        <h3><Gift size={19} aria-hidden />{say('catalogue')}</h3>
        <p>{say(preserved ? 'kept' : 'starting')}</p>
        <div className="l-gs-preview-counts"><span><Crown size={16} aria-hidden />{say('levels', { n: String(levels) })}</span><span><Gift size={16} aria-hidden />{say('rewards', { n: String(rewards) })}</span></div>
        {!preserved && preset.tier_names.length > 0 && <ul className="l-gs-preview-levels" aria-label={say('levels', { n: String(levels) })}>{preset.tier_names.map(name => <li key={name}>{name}</li>)}</ul>}
        {examples.length > 0 ? <p className="l-gs-preview-examples"><strong>{say('rewardExamples')}</strong> {examples.join(' · ')}</p> : <p>{say('noRewards')}</p>}
      </section>
      {groupsOf(answer.ways).map(({ group, ways }) => {
        const rows = ways.flatMap(way => {
          if ((answer.not_used ?? []).includes(way.key)) return []
          if (way.key === 'tier_progress') return [{ key: way.key, text: t(`loyalty.options.choice.tier_progress_by.${effective.tier_progress_by ?? 'points'}`, PROGRESS_BY_WORDS[String(effective.tier_progress_by ?? 'points')] ?? '') }]
          const enabled = review.on.find(line => line.key === way.key)
          // No expiry is still an important rule to explain, rather than hiding it as a disabled bonus.
          return enabled ? [enabled] : way.key === 'points_expiry' ? [{ key: way.key, text: sentenceOf(way.key, effective, ctx) }] : []
        })
        const GroupIcon = group === 'earn' ? Coins : group === 'bonus' ? Gift : SlidersHorizontal
        return <section className="l-gs-preview-section" data-preview-group={group} key={group} data-hue={GROUP_HUE[group]}>
          <h3><GroupIcon size={19} aria-hidden />{t(`loyalty.options.group.${group}`, GROUP_WORDS[group])}</h3>
          <ul className="l-gs-preview-rules">{rows.map(line => <li key={line.key}><WayIcon way={line.key} on /><div><strong>{wayTitle(ctx.say, line.key)}</strong><p>{line.text}</p></div></li>)}</ul>
        </section>
      })}
    </div>
    <p className="l-gs-preview-note">{design('previewHint')}</p>
  </aside>
}
