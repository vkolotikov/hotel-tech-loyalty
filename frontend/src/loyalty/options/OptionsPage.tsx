import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Award, ChevronRight, Gift, Tag, WandSparkles, Zap, type LucideIcon } from 'lucide-react'
import { PageHeader } from '../../workspace/ui/PageHeader'
import { SectionTitle } from '../../workspace/ui/Typography'
import { points } from '../lib/format'
import { OPTIONS_KEY, optionsApi } from './optionsApi'
import { LoadFailed, Loading } from './parts'
import { SetupBanner } from './SetupBanner'
import type { OptionsAnswer } from './types'
import { WayCard } from './WayCard'

/** A link that looks like the header's secondary button (Members' own tool style). */
const TOOL = 'inline-flex items-center gap-2 rounded-full border border-a-border bg-a-surface px-4 py-2.5 text-sm font-semibold text-a-text hover:bg-a-surface-2'

/**
 * Ways to earn (release 7, spec 2026-10-25 §1): one card per way to earn or be rewarded — whether it is on, what members
 * get with it in a sentence, its numbers — each saved on its own; then the programme's other parts (tiers, rewards,
 * offers, boosts) with how many there are, each opening its own page. Everyone reads it; a manager changes it (the
 * server's `can_change`) — for anyone else nothing is pressable, and the page says why. The cards and their fields are
 * the server's (`ways`, `fields`).
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
          <section aria-labelledby="options-ways" className="space-y-3">
            {/* The page's title already says what these are: the section's own title is for a screen reader. */}
            <h2 id="options-ways" className="sr-only">{t('loyalty.options.ways_title', 'How members earn and what they get')}</h2>
            <div className="grid gap-3 xl:grid-cols-2">
              {data.ways.map(way => <WayCard key={way.key} way={way} answer={data} manage={data.can_change} />)}
            </div>
          </section>
          <Parts answer={data} />
        </>
      )}
    </div>
  )
}

/** Tiers, rewards, offers and boosts keep their own pages: each card says how many there are and opens its page. */
function Parts({ answer }: { answer: OptionsAnswer }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const c = answer.catalogue
  return (
    <section aria-labelledby="options-parts" className="space-y-3">
      <SectionTitle><span id="options-parts">{t('loyalty.options.parts_title', 'The rest of your programme')}</span></SectionTitle>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Part part="tiers" to="/loyalty/program" icon={Award} count={points(c.tiers, locale)} title={t('loyalty.options.part.tiers', 'Tiers')}
          caption={t('loyalty.options.part.tiers_count', 'In the ladder')} />
        <Part part="rewards" to="/loyalty/rewards" icon={Gift} count={points(c.rewards.length, locale)} title={t('loyalty.options.part.rewards', 'Rewards')}
          caption={t('loyalty.options.part.rewards_count', 'In the catalogue')} />
        <Part part="offers" to="/loyalty/rewards?tab=offers" icon={Tag} count={points(c.offers, locale)} title={t('loyalty.options.part.offers', 'Offers')}
          caption={t('loyalty.options.part.offers_count', 'Switched on')} />
        <Part part="boosts" to="/loyalty/program" icon={Zap} count={points(c.boosts, locale)} title={t('loyalty.options.part.boosts', 'Boosts')}
          caption={t('loyalty.options.part.boosts_count', 'On now or coming up')} />
      </ul>
    </section>
  )
}

function Part({ part, to, icon: Icon, count, title, caption }: { part: string; to: string; icon: LucideIcon; count: string; title: string; caption: string }) {
  return (
    <li data-part={part}>
      <Link to={to} className="group flex h-full items-center gap-3 rounded-2xl border border-a-border bg-a-surface p-4 hover:bg-a-surface-2">
        <span aria-hidden className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-a-accent/10 text-a-accent-text"><Icon size={18} /></span>
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
