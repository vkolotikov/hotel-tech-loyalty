import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { OPTIONS_KEY, optionsApi } from '../options/optionsApi'
import { Checks } from '../options/Overview'
import { OverviewButton } from '../overview/OverviewUI'
import { Notice } from '../../workspace/ui/Notice'
import type { Program } from '../program/types'
import { useAdminWords } from './words'
import { LEVELS, QUALIFICATION, POINTS_SETTINGS, SETUP } from './navigation'
import { ManagementPanel } from './ManagementUI'
import { useRedesignWords } from '../redesign/words'
import { useBoot } from '../LoyaltyProvider'
import { listOf, money, points } from '../lib/format'

export function TierChecks({ program }: { program: Program }) {
  const say = useAdminWords(), { t, i18n } = useTranslation(), boot = useBoot()
  const by = boot.programme.progress_by ?? 'points'
  return <>{(program.advice ?? []).map((item, index) => <div className="l-ad-inset" key={`${item.code}-${index}`} data-advice={item.code} data-level={item.level} data-hue={item.level === 'warn' ? 'gift' : 'rule'}>
    <p>{item.code === 'tiers_missing_threshold' ? say('thresholdsMissing', item.params) : item.code === 'benefit_unused' ? say('needsTier') : t('loyalty.program.advice.tiers_share_threshold.title', 'Several tiers start at the same figure')}</p>
    {item.code === 'tiers_share_threshold' && <p>{t('loyalty.program.advice.tiers_share_threshold.line', '{{tiers}} all start at {{value}}: members reach only one of them by earning. Give each tier its own starting figure, or keep the others for members you place by hand.', { tiers: listOf(item.tiers.map(t => t.name), i18n.language), value: by === 'spend' ? money(item.params.value, boot.venue.currency, i18n.language) : t(`loyalty.program.advice.${by}`, by === 'visits' ? '{{n}} visits' : '{{n}} points', { n: points(item.params.value, i18n.language) }) })}</p>}
    <div className="l-ad-actions">{item.tiers.map(tier => boot.staff.can.manage_program ? <Link className="l-ov-link" key={tier.id} to={`${LEVELS}&tier=${tier.id}`}>{t('loyalty.program.advice.open_tier', 'Open {{tier}}', { tier: tier.name })}</Link> : <span key={tier.id}>{tier.name}</span>)}
      {item.benefits.map(b => <Link className="l-ov-link" key={b.id} to={`/loyalty/rewards?tab=benefits&selected=${b.id}&assign=${b.id}`}>{b.name}</Link>)}</div>
  </div>)}</>
}
export function ProgrammeReadiness({ program }: { program: Program }) {
  const query = useQuery({ queryKey: OPTIONS_KEY, queryFn: optionsApi.options })
  const say = useAdminWords(), rd = useRedesignWords(), navigate = useNavigate(), { t } = useTranslation()
  const open = (way: string) => navigate(way === 'tier_progress' ? QUALIFICATION : way === 'points_expiry' ? POINTS_SETTINGS : `/loyalty/options?tab=${['welcome_bonus', 'birthday_bonus', 'referrals'].includes(way) ? 'bonus' : 'earn'}&way=${way}`)
  return <div className="l-ad-page"><header className="l-ad-heading"><h1>{say('readiness')}</h1><div className="l-ad-actions"><Link className="l-ov-button" to={LEVELS}>{say('levels')}</Link><Link className="l-ov-button" to={SETUP}>{rd('guidedSetup')}</Link></div></header>
    <ManagementPanel title={say('levels')}><TierChecks program={program} />{!program.advice?.length && <p>{say('readinessReady')}</p>}</ManagementPanel>
    {query.data && <Checks answer={query.data} open={open} />}
    {query.isError && <Notice tone="danger"><OverviewButton onClick={() => { void query.refetch() }}>{t('loyalty.common.retry', 'Try again')}</OverviewButton></Notice>}
  </div>
}
