import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { addDays, formatDate } from '../../workspace/lib/wallClock'
import { optionText, RHYTHM_DAYS } from '../lib/options'
import type { Platform, StrategyOutput, StrategyPillar } from '../lib/types'
import { PlatformMark } from '../ui/PlatformMark'
import { safeOutput, strings } from './strategyMath'

/** A Monday: the rhythm's days are named from it in the reader's language. */
const A_MONDAY = '2026-10-12'

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-a-border bg-a-surface p-4">
      <h2 className="font-a-display text-lg font-normal text-a-text">{title}</h2>
      {children}
    </section>
  )
}

function Lines({ label, items }: { label?: string; items: string[] }) {
  if (items.length === 0) return null
  return (
    <div className="space-y-1">
      {label && <p className="text-xs font-medium text-a-text-2">{label}</p>}
      <ul className="list-disc space-y-1 pl-5 text-sm text-a-text">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>
    </div>
  )
}

function Text({ label, value }: { label?: string; value: unknown }) {
  if (typeof value !== 'string' || value.trim() === '') return null
  return (
    <div className="space-y-0.5">
      {label && <p className="text-xs font-medium text-a-text-2">{label}</p>}
      <p className="whitespace-pre-wrap text-sm text-a-text">{value}</p>
    </div>
  )
}

/**
 * A strategy read as a document (spec §4.5): what the AI wrote, part by part,
 * in the words it wrote them (the brand's language); the headings are the
 * portal's. Any part an older strategy lacks is left out.
 */
export function StrategyDocument({ output: raw, pillars, platforms, locale }: {
  output: StrategyOutput
  /** The strategy's pillars as saved, for a strategy whose text lists none. */
  pillars: StrategyPillar[]
  platforms: readonly Platform[]
  locale: string
}) {
  const { t } = useTranslation()
  const w = (key: string, english: string) => t(`content.strategy.${key}`, english)
  const output = safeOutput(raw)
  const positioning = output.positioning_narrative
  const written = (output.content_pillars ?? []).filter(p => typeof p?.name === 'string' && p.name.trim() !== '')
  const mix = Object.entries(output.content_mix ?? {}).filter(([, pct]) => typeof pct === 'number' && pct > 0)
  const rhythm = output.weekly_rhythm ?? {}
  const playbooks = Object.entries(output.platform_strategy ?? {})
  const lists: [string, string, string[]][] = [
    ['risks', 'Risks', strings(output.risks)],
    ['opportunities', 'Opportunities', strings(output.opportunities)],
    ['missing', 'Missing information', strings(output.missing_information)],
    ['next', 'Next actions', strings(output.next_actions)],
  ]

  return (
    <div className="space-y-4">
      {(output.brand_summary || strings(output.assumptions).length > 0) && (
        <Block title={w('summary', 'Brand summary')}>
          <Text value={output.brand_summary} />
          <Lines label={w('assumptions', 'What the AI assumed')} items={strings(output.assumptions)} />
        </Block>
      )}

      {positioning && (
        <Block title={w('positioning', 'Positioning')}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Text label={w('old_way', 'The old way')} value={positioning.old_way} />
            <Text label={w('new_way', 'The new way')} value={positioning.new_way} />
          </div>
          <Lines label={w('beliefs', 'Beliefs')} items={strings(positioning.beliefs)} />
          <Lines label={w('key_messages', 'Key messages')} items={strings(positioning.key_messages)} />
        </Block>
      )}

      {(output.audience_map ?? []).length > 0 && (
        <Block title={w('audiences', 'Audience map')}>
          <div className="grid gap-3 md:grid-cols-2">
            {(output.audience_map ?? []).map((a, i) => (
              <div key={i} className="space-y-2 rounded-lg border border-a-border p-3">
                <p className="text-sm font-semibold text-a-text">{a.name}</p>
                <Lines label={w('pains', 'Pains')} items={strings(a.pains)} />
                <Lines label={w('desires', 'Desires')} items={strings(a.desires)} />
                <Lines label={w('objections', 'Objections')} items={strings(a.objections)} />
                <Lines label={w('triggers', 'Emotional triggers')} items={strings(a.emotional_triggers)} />
                <Lines label={w('engages', 'Content they engage with')} items={strings(a.content_they_engage_with)} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {(written.length > 0 || pillars.length > 0) && (
        <Block title={w('pillars', 'Pillars')}>
          <div className="grid gap-3 md:grid-cols-2">
            {written.length > 0
              ? written.map((p, i) => (
                  <div key={i} className="space-y-2 rounded-lg border border-a-border p-3">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-a-text">{p.name}</p>
                      {typeof p.frequency_weight === 'number' && (
                        <span className="text-xs text-a-text-2">{t('content.strategy.weight', 'Weight {{weight}} %', { weight: p.frequency_weight })}</span>
                      )}
                    </div>
                    <Text value={p.description} />
                    <Text label={w('purpose', 'Purpose')} value={p.purpose} />
                    <Lines label={w('topics', 'Example topics')} items={strings(p.example_topics)} />
                    <Lines label={w('ctas', 'Calls to action')} items={strings(p.cta_examples)} />
                    <Text label={w('visual', 'Visual direction')} value={p.visual_direction} />
                  </div>
                ))
              : pillars.map(p => (
                  <div key={p.id} className="space-y-2 rounded-lg border border-a-border p-3">
                    <p className="text-sm font-semibold text-a-text">{p.name}</p>
                    <Text value={p.description} />
                    <Text label={w('purpose', 'Purpose')} value={p.purpose} />
                  </div>
                ))}
          </div>
        </Block>
      )}

      {mix.length > 0 && (
        <Block title={w('mix', 'Content mix')}>
          <ul className="space-y-2">
            {mix.map(([category, pct]) => (
              <li key={category} className="space-y-1">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-a-text">{optionText(t, 'mix', category)}</span>
                  <span className="text-a-text-2">{pct} %</span>
                </div>
                <div className="h-1.5 rounded-full bg-a-surface-2" aria-hidden>
                  <div className="h-1.5 rounded-full bg-a-accent" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {Object.keys(rhythm).length > 0 && (
        <Block title={w('rhythm', 'Weekly rhythm')}>
          <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
            {RHYTHM_DAYS.map((day, i) => {
              const plan = rhythm[day]
              return (
                <li key={day} className="space-y-1 rounded-lg border border-a-border p-2.5">
                  <p className="font-a-mono text-xs uppercase tracking-[0.12em] text-a-text-2">{formatDate(addDays(A_MONDAY, i), locale, { weekday: 'long' })}</p>
                  {plan?.role && <p className="text-sm font-medium text-a-text">{optionText(t, 'role', plan.role)}</p>}
                  <Text value={plan?.description} />
                </li>
              )
            })}
          </ol>
        </Block>
      )}

      {playbooks.length > 0 && (
        <Block title={w('platforms', 'Platform playbooks')}>
          <div className="grid gap-3 md:grid-cols-2">
            {playbooks.map(([platform, book]) => (
              <div key={platform} className="space-y-2 rounded-lg border border-a-border p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-a-text">
                  {(platforms as readonly string[]).includes(platform) && <PlatformMark platform={platform as Platform} size="sm" />}
                  {t(`content.platform.${platform}`, platform)}
                </p>
                <Text label={w('role', 'Role')} value={book?.role} />
                <Lines label={w('formats', 'Formats')} items={strings(book?.formats)} />
                <Text label={w('tone', 'Tone')} value={book?.tone} />
                <Text label={w('frequency', 'Frequency')} value={book?.frequency} />
                <Lines label={w('post_types', 'Post types')} items={strings(book?.post_types)} />
                <Text label={w('cta_style', 'Call-to-action style')} value={book?.cta_style} />
                <Lines label={w('mechanics', 'Engagement mechanics')} items={strings(book?.engagement_mechanics)} />
                <Text label={w('visual_style', 'Visual style')} value={book?.visual_style} />
              </div>
            ))}
          </div>
        </Block>
      )}

      {(output.engagement_strategy || output.conversion_strategy) && (
        <div className="grid gap-4 md:grid-cols-2">
          {output.engagement_strategy && (
            <Block title={w('engagement', 'Engagement')}>
              <Lines label={w('goals', 'Goals')} items={strings(output.engagement_strategy.primary_goals)} />
              <Lines items={(output.engagement_strategy.mechanics ?? []).map(m => [m?.goal, m?.tactic].filter(Boolean).join(': ')).filter(Boolean)} />
            </Block>
          )}
          {output.conversion_strategy && (
            <Block title={w('conversion', 'Conversion')}>
              <Text label={w('approach', 'Approach')} value={output.conversion_strategy.approach} />
              <Lines label={w('soft_ctas', 'Soft calls to action')} items={strings(output.conversion_strategy.soft_cta_examples)} />
            </Block>
          )}
        </div>
      )}

      {output.visual_direction && <Block title={w('visual', 'Visual direction')}><Text value={output.visual_direction} /></Block>}

      {(strings(output.monthly_themes).length > 0 || (output.campaign_ideas ?? []).length > 0) && (
        <Block title={w('themes', 'Themes and campaigns')}>
          <Lines label={w('monthly', 'Monthly themes')} items={strings(output.monthly_themes)} />
          <Lines label={w('campaigns', 'Campaign ideas')}
            items={(output.campaign_ideas ?? []).map(c => [c?.name, c?.goal, c?.description].filter(Boolean).join(' — ')).filter(Boolean)} />
        </Block>
      )}

      {(output.example_posts ?? []).length > 0 && (
        <Block title={w('examples', 'Example posts')}>
          <ul className="space-y-2">
            {(output.example_posts ?? []).map((p, i) => (
              <li key={i} className="rounded-lg border border-a-border p-3 text-sm">
                <p className="font-medium text-a-text">{p?.hook}</p>
                {p?.summary && <p className="text-a-text-2">{p.summary}</p>}
                {p?.platform && <p className="mt-1 text-xs text-a-text-2">{t(`content.platform.${p.platform}`, p.platform)}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {lists.some(([, , items]) => items.length > 0) && (
        <div className="grid gap-4 md:grid-cols-2">
          {lists.filter(([, , items]) => items.length > 0).map(([key, english, items]) => (
            <Block key={key} title={w(key, english)}><Lines items={items} /></Block>
          ))}
        </div>
      )}
    </div>
  )
}
