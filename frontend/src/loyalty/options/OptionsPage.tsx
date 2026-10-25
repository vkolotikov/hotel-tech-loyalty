import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { ArrowRight, WandSparkles } from 'lucide-react'
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
        line={t('loyalty.options.line', 'How members earn points and what they get back. Switch a way on or off and set its numbers; members see a saved change at once.')}
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
            <SectionTitle><span id="options-ways">{t('loyalty.options.ways_title', 'How members earn and what they get')}</span></SectionTitle>
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
        <Part part="tiers" to="/loyalty/program" count={points(c.tiers, locale)} title={t('loyalty.options.part.tiers', 'Tiers')}
          caption={t('loyalty.options.part.tiers_count', 'In the ladder')} line={t('loyalty.options.part.tiers_line', 'The levels members climb as they earn, each with its benefits.')}
          open={t('loyalty.options.part.open_program', 'Open Program')} />
        <Part part="rewards" to="/loyalty/rewards" count={points(c.rewards.length, locale)} title={t('loyalty.options.part.rewards', 'Rewards')}
          caption={t('loyalty.options.part.rewards_count', 'In the catalogue')} line={t('loyalty.options.part.rewards_line', 'What members spend their points on.')}
          open={t('loyalty.options.part.open_rewards', 'Open Rewards')} />
        <Part part="offers" to="/loyalty/rewards?tab=offers" count={points(c.offers, locale)} title={t('loyalty.options.part.offers', 'Offers')}
          caption={t('loyalty.options.part.offers_count', 'Switched on')} line={t('loyalty.options.part.offers_line', 'Deals for members for a while, such as a discount or bonus points.')}
          open={t('loyalty.options.part.open_offers', 'Open offers')} />
        <Part part="boosts" to="/loyalty/program" count={points(c.boosts, locale)} title={t('loyalty.options.part.boosts', 'Boosts')}
          caption={t('loyalty.options.part.boosts_count', 'On now or coming up')} line={t('loyalty.options.part.boosts_line', 'Extra points for a while, such as a double points weekend.')}
          open={t('loyalty.options.part.open_program', 'Open Program')} />
      </ul>
    </section>
  )
}

function Part({ part, to, count, title, caption, line, open }: { part: string; to: string; count: string; title: string; caption: string; line: string; open: ReactNode }) {
  return (
    <li data-part={part}>
      <Link to={to} className="flex h-full flex-col gap-2 rounded-2xl border border-a-border bg-a-surface p-4 hover:bg-a-surface-2">
        <span className="text-sm font-medium text-a-text">{title}</span>
        <span className="flex items-baseline gap-2">
          <span className="font-a-display text-3xl font-light tabular-nums leading-none text-a-text">{count}</span>
          <span className="text-xs text-a-text-2">{caption}</span>
        </span>
        <span className="text-sm text-a-text-2">{line}</span>
        <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-semibold text-a-accent-text">{open}<ArrowRight size={14} aria-hidden /></span>
      </Link>
    </li>
  )
}
