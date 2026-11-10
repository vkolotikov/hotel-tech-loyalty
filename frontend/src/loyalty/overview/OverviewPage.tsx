import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useBoot } from '../LoyaltyProvider'
import { loyaltyApi } from '../lib/api'
import { PulseCard } from '../../workspace/pulse/PulseCard'
import { money, points, when } from '../lib/format'
import { overviewAssets as assets } from './assets'
import { cleanAssets, metricIcons } from './cleanAssets'
import './overview-clean.css'
import { filterFrom, overviewSearch, PERIODS, periodFrom } from './overviewMath'
import { OverviewBadge, OverviewButton, OverviewDialog, OverviewRecovery, OverviewSkeleton } from './OverviewUI'
import { OverviewDetails, ActivityRows } from './OverviewDetails'
import { useOnline, useOverviewModule, usePhone } from './useOverview'
import { useOverviewWords } from './words'
import type { Panel, Summary } from './types'
import { MobileHome } from '../mobile/MobileHome'
import { SetupChecklist } from '../start/SetupChecklist'

export function OverviewPage() {
  const phone = usePhone()
  return phone ? <MobileHome /> : <DesktopOverviewPage />
}

function DesktopOverviewPage() {
  const boot = useBoot()
  const say = useOverviewWords()
  const { i18n } = useTranslation()
  const locale = i18n.language || 'en'
  const location = useLocation()
  const navigate = useNavigate()
  const period = periodFrom(location.search)
  const filter = filterFrom(location.search)
  const [panel, setPanel] = useState<Panel | null>(() => {
    const requested = new URLSearchParams(location.search).get('panel')
    return requested === 'program' || requested === 'preview' ? requested : null
  })
  const [picker, setPicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)
  const pickerButton = useRef<HTMLButtonElement>(null)
  const online = useOnline()
  const phone = usePhone()
  const summary = useOverviewModule('summary', period)
  const checks = useOverviewModule('checks', period)
  const metrics = useOverviewModule('metrics', period)
  const queue = useOverviewModule('queue', period)
  const activity = useOverviewModule('activity', period, filter)
  // The venue's clock and weather above the overview (2026-11-09); the page stands without it.
  const pulse = useQuery({ queryKey: ['loyalty', 'pulse'], queryFn: loyaltyApi.pulse, staleTime: 10 * 60_000, refetchInterval: 15 * 60_000, retry: false })
  const s = summary.data?.data
  const c = checks.data?.data
  const m = metrics.data?.data
  const q = queue.data?.data
  const a = activity.data?.data
  const initial = s && !s.configured
  const limited = !boot.staff.can.view_insights
  const periodLabel = say(`period${period}`)
  const go = (change: Parameters<typeof overviewSearch>[1]) => navigate({ pathname: '/loyalty/overview', search: overviewSearch(location.search, change) }, { replace: true, preventScrollReset: true })
  useEffect(() => {
    if (!picker || phone) return
    const outside = (event: PointerEvent) => { if (!pickerRef.current?.contains(event.target as Node)) setPicker(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setPicker(false); pickerButton.current?.focus() } }
    window.addEventListener('pointerdown', outside); window.addEventListener('keydown', key)
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', key) }
  }, [picker, phone])
  const last = [summary.data, checks.data, metrics.data, queue.data, activity.data].filter(x => x !== undefined).map(x => x.as_of).sort()[0]
  const stale = !online || [summary, checks, metrics, queue, activity].some(x => x.isError && x.data)
  const title = initial ? say('setupTitle') : limited ? say('limitedTitle') : say('title')
  const heading = <div className="l-ov-page-heading"><div><h1>{title}</h1>{limited && <p>{say('limitedLine')}</p>}</div>{s?.configured && !limited && <OverviewButton className="l-ov-preview-action" onClick={() => setPanel('preview')}><img src={assets.app} alt="" />{say('previewAction')}</OverviewButton>}</div>
  const retry = (module: typeof summary | typeof checks | typeof metrics | typeof queue | typeof activity) => () => { void module.refetch() }
  const attention = <section className="l-ov-attention l-ov-inset" data-warning={c?.warnings ? true : undefined} aria-label={say('review')}>
    {checks.isError && !c ? <OverviewRecovery title={say('checksFailed')} busy={checks.isFetching} onRetry={retry(checks)} forbidden={checks.forbidden} /> : !c ? <OverviewSkeleton rows={2} /> : <>
      <div className="l-ov-clean-alert"><span className="l-ov-clean-icon" data-tone={c.warnings ? 'amber' : 'green'}><img src={c.warnings ? cleanAssets.settings : cleanAssets.activityLevel} alt="" /></span><div><h2 className={c.warnings ? 'l-ov-attention-text' : 'l-ov-success-text'}>{c.warnings ? say(c.warnings === 1 ? 'reviewOne' : 'reviewCount', { count: c.warnings }) : say('clear')}</h2>{c.warnings > 0 && <p>{[...new Set(c.issues.filter(issue => issue.level === 'warn').map(issue => say(issue.area === 'program' ? 'membership' : 'earning')))].join(' · ')}</p>}{checks.isError && <p>{say('refreshFailed')}</p>}</div></div>
      <OverviewButton onClick={() => setPanel('issues')}>{c.warnings ? say('review') : c.issues.length ? say('tips', { count: c.issues.length }) : say('details')}</OverviewButton>
    </>}
  </section>
  const panels = { program: say('programPanel'), preview: say('previewPanel'), issues: say('issuesPanel'), numbers: say('about'), activity: say('activity'), requests: say('requestsPanel') }
  return <div className="l-ov-page l-ov-clean-page">
    {heading}
    <PulseCard pulse={pulse.data} name={boot.staff.name ? boot.staff.name.trim().split(/\s+/)[0] : null} />
    {!online && <div className="l-ov-inset l-ov-offline" role="status"><strong>{say('offline')}</strong><p>{say('offlineLine')}</p></div>}
    {summary.isError && !s && <OverviewRecovery title={say('unavailableOverview')} busy={summary.isFetching} onRetry={retry(summary)} forbidden={summary.forbidden} />}
    {!s && !summary.isError && <section className="l-ov-panel"><OverviewSkeleton rows={4} /></section>}
    {initial && <SetupState />}
    {s?.configured && <SetupChecklist setup={s.setup} />}
    {s?.configured && <>
      {!limited && <>{attention}<ProgramSummary summary={s} onDetails={() => setPanel('program')} onPreview={() => setPanel('preview')} /></>}
      {limited && <><section className="l-ov-panel l-ov-limited"><OverviewBadge>{say('limited')}</OverviewBadge><h2>{say('dailyService')}</h2><p>{say('managedByOwner')}</p></section><div className="l-ov-service-actions">{[['/loyalty', 'findMember'], ['/loyalty/requests', 'review'], ['/loyalty/scan', 'scan']].map(([to, key]) => <Link to={to} className="l-ov-panel" key={to}>{say(key as 'findMember' | 'review' | 'scan')} →</Link>)}</div></>}
    </>}
    {!initial && !limited && <section className="l-ov-glance" aria-labelledby="overview-glance">
      <div className="l-ov-glance-controls"><h2 id="overview-glance">{say('keyMetrics')}</h2><button className="l-ov-link l-ov-about" onClick={() => setPanel('numbers')}><img src={cleanAssets.help} alt="" />{say('about')}</button>
        <div className="l-ov-period" ref={pickerRef}><button ref={pickerButton} type="button" className="l-ov-button" aria-expanded={picker} aria-controls="overview-period-options" onClick={() => setPicker(!picker)}><img src={assets.events} alt="" />{periodLabel}<img src={assets.down} alt="" /></button>{picker && !phone && <div className="l-ov-period-options l-ov-panel" id="overview-period-options" role="group" aria-label={periodLabel}>{PERIODS.map(p => <OverviewButton key={p} aria-pressed={p === period} onClick={() => { go({ period: p }); setPicker(false); pickerButton.current?.focus() }}>{say(`period${p}`)}{p === period ? ' ✓' : ''}</OverviewButton>)}<p>{say('periodHint')}</p></div>}</div>
      </div>
      {metrics.isError && <OverviewRecovery onRetry={retry(metrics)} busy={metrics.isFetching} forbidden={metrics.forbidden} />}
      <div className="l-ov-metrics" aria-busy={metrics.isFetching}>{m ? m.items.map(item => <button type="button" key={item.key} className="l-ov-metric l-ov-panel" onClick={() => setPanel('numbers')}><span>{say(item.key)}</span><strong>{item.value === null ? '—' : points(item.value, locale)}</strong><small>{item.key === 'members' ? say('joined', { count: points(m.joined, locale) }) : item.key === 'points_available' ? say('balances') : item.kind === 'current' ? say('current') : say('completed')}</small><span className="l-ov-clean-icon l-ov-clean-metric-icon" data-tone={item.key === 'rewards_used' || item.key === 'benefits_fulfilled' ? 'green' : 'cyan'}><img src={metricIcons[item.key]} alt="" /></span></button>) : [0, 1, 2].map(i => <div className="l-ov-metric l-ov-panel" key={i}>{metrics.isError || metrics.forbidden ? <><strong>—</strong><small>{say('sourceUnavailable')}</small></> : <OverviewSkeleton />}</div>)}</div>
      {m?.items.find(item => item.key === 'members')?.value === 0 && <section className="l-ov-inset l-ov-empty"><h3>{say('noMembers')}</h3><p>{say('noMembersLine')}</p><Link to="/loyalty" className="l-ov-link">{say('addMember')} →</Link></section>}
    </section>}
    {!initial && <div className={`l-ov-daily ${limited ? 'l-ov-daily-limited' : ''}`}>
      {s?.mode === 'discounts' && q?.total === 0 ? <section className="l-ov-panel l-ov-queue"><h2>{say('manageOffers')}</h2><p>{say('offersLine', { count: s.offers })}</p><Link className="l-ov-button" to="/loyalty/rewards?tab=offers">{say('openOffers')}</Link></section> : <section className="l-ov-panel l-ov-queue"><div className="l-ov-section-heading"><div className="l-ov-clean-section-title"><h2>{say('team')}</h2>{q && <OverviewBadge tone={q.total ? 'amber' : 'green'}>{say('waiting', { count: points(q.total, locale) })}</OverviewBadge>}</div><button type="button" className="l-ov-link" onClick={() => setPanel('requests')}>{say('allRequests')} →</button></div>
        {queue.isError && <OverviewRecovery onRetry={retry(queue)} busy={queue.isFetching} forbidden={queue.forbidden} />}
        {!q && !queue.isError && <OverviewSkeleton />}
        {q && q.items.length === 0 && <div className="l-ov-empty"><h3>{say('caughtUp')}</h3><p>{say('caughtUpLine')}</p></div>}
        {q && <ul className="l-ov-requests">{q.items.map(item => <li key={`${item.source}:${item.id}`}><Link className="l-ov-clean-request-row" to={item.href}><span className="l-ov-clean-icon" data-tone={item.source === 'redemption' ? 'green' : 'cyan'}><img src={item.source === 'redemption' ? cleanAssets.reward : assets.gift} alt="" /></span><span className="l-ov-clean-record"><strong>{item.title ?? say(item.source === 'benefit' ? 'benefit' : 'redemption')}</strong><small>{say(item.source === 'benefit' ? 'benefit' : 'redemption')} · {item.member ?? say('noName')}</small></span><time className="l-ov-clean-time" dateTime={item.created_at ?? undefined}>{when(item.created_at, locale, boot.venue.timezone)}</time></Link></li>)}</ul>}
      </section>}
      {!limited && <section className="l-ov-panel l-ov-activity"><div className="l-ov-section-heading"><h2>{say('activity')}</h2><button type="button" className="l-ov-link" onClick={() => setPanel('activity')}>{say('viewActivity')} →</button></div>{activity.isError && <OverviewRecovery onRetry={retry(activity)} busy={activity.isFetching} forbidden={activity.forbidden} />}{!a && !activity.isError && <OverviewSkeleton />}{a && <ActivityRows compact items={a.items.slice(0, 3)} filter={filter} onClear={() => go({ activity: 'all' })} />}</section>}
    </div>}
    <Link to="/loyalty/scan" className="l-ov-button l-ov-mobile-scan">{say('scan')}</Link>
    {last && <p className="l-ov-updated" role="status">{say(stale ? 'cached' : 'updated', { time: when(last, locale, boot.venue.timezone) })}</p>}
    {picker && phone && <OverviewDialog title={say('activityPeriod')} onClose={() => setPicker(false)}><p>{say('periodHint')}</p>{PERIODS.map(p => <OverviewButton key={p} aria-pressed={p === period} onClick={() => { go({ period: p }); setPicker(false) }}>{say(`period${p}`)}{p === period ? ' ✓' : ''}</OverviewButton>)}</OverviewDialog>}
    {panel && <OverviewDialog title={panels[panel]} kind={panel === 'preview' ? 'preview' : 'drawer'} onClose={() => setPanel(null)}><OverviewDetails panel={panel} summary={summary} checks={checks} metrics={metrics} queue={queue} activity={activity} period={period} filter={filter} onFilter={value => go({ activity: value })} /></OverviewDialog>}
  </div>
}

function ProgramSummary({ summary: s, onDetails, onPreview }: { summary: Summary; onDetails: () => void; onPreview: () => void }) {
  const say = useOverviewWords()
  const boot = useBoot()
  const { i18n } = useTranslation()
  const n = (value: number) => points(value, i18n.language)
  const earn = s.options.points_on_bookings || s.options.desk_earn_enabled ? say('rateShort', { points: n(Number(s.options.points_per_currency)), currency: money(1, boot.venue.currency, i18n.language) }) : say('purchaseOff')
  const example = Math.round((s.minimum_reward?.points_cost ?? 0) * 1.5)
  const facts = s.mode === 'points' ? [
    { label: say('earnRate'), value: earn },
    { label: say('welcome'), value: say('shortPoints', { points: n(Number(s.options.welcome_bonus_points)) }) },
    { label: say('levelLabel'), value: n(s.tiers.length) },
    { label: say('lowestReward'), value: s.minimum_reward ? say('shortPoints', { points: n(s.minimum_reward.points_cost) }) : '—' },
  ] : [
    { label: say('levelLabel'), value: n(s.tiers.length) },
    { label: say('benefits'), value: n(s.benefits) },
    { label: say('active_offers'), value: n(s.offers) },
  ]
  return <section className="l-ov-program l-ov-panel">
    <img className="l-ov-diagonal" src={cleanAssets.diagonal} alt="" />
    <div className="l-ov-program-copy"><div className="l-ov-clean-program-heading"><div className="l-ov-program-label"><span className="l-ov-clean-icon" data-tone="cyan"><img src={cleanAssets.program} alt="" /></span><h2>{say(`${s.mode}Title`)}</h2><OverviewBadge tone="green">{say(`${s.mode}Enabled`)}</OverviewBadge></div><button type="button" className="l-ov-link" onClick={onDetails}>{say('details')} →</button></div><dl className="l-ov-clean-facts">{facts.map(fact => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></div>
    <button type="button" className="l-ov-member-card" aria-label={say('previewAction')} onClick={onPreview}><span className="l-ov-clean-card-heading"><span>{boot.organization.name.toLocaleUpperCase(i18n.language)}</span><img src={cleanAssets.card} alt="" /></span><b>{s.mode === 'points' ? say('shortPoints', { points: n(example) }) : s.tiers[0]?.name ?? say('membership')}</b><small>{say(s.mode === 'points' ? 'sampleBalance' : 'sampleMembership')}</small></button>
  </section>
}

function SetupState() {
  const say = useOverviewWords()
  const boot = useBoot()
  return <><section className="l-ov-panel l-ov-first"><h2>{say('firstProgram')}</h2><div className="l-ov-setup-choices">{(['discounts', 'points', 'visits'] as const).map(mode => <div className="l-ov-inset" key={mode}><span className="l-ov-clean-icon" data-tone={mode === 'visits' ? 'green' : 'cyan'}><img src={mode === 'discounts' ? cleanAssets.setupDiscounts : mode === 'points' ? cleanAssets.setupPoints : cleanAssets.setupVisits} alt="" /></span><h3>{say(`${mode}Option`)}</h3><p>{say(`${mode}Hint`)}</p></div>)}</div><div className="l-ov-actions">{boot.staff.can.manage_program && <Link to="/loyalty/program/setup" className="l-ov-button l-ov-primary"><img src={assets.program} alt="" />{say('startSetup')}</Link>}<Link to="/loyalty/guide" className="l-ov-link">{say('guide')} →</Link></div></section><section className="l-ov-panel l-ov-clean-setup"><h2>{say('setupSteps')}</h2><ol className="l-ov-steps">{(['step1', 'step2', 'step3', 'step4'] as const).map((key, index) => <li key={key}><span>{index + 1}</span>{say(key)}</li>)}</ol></section><p className="l-ov-clean-preserve"><img src={cleanAssets.setupHelp} alt="" />{say('preserveLine')}</p></>
}
