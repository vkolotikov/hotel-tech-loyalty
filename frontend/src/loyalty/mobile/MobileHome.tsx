import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useBoot } from '../LoyaltyProvider'
import { points, when } from '../lib/format'
import { ActivityRows, OverviewDetails } from '../overview/OverviewDetails'
import { OverviewButton, OverviewDialog, OverviewRecovery, OverviewSkeleton } from '../overview/OverviewUI'
import { filterFrom, overviewSearch, periodFrom, PERIODS } from '../overview/overviewMath'
import { useOnline, useOverviewModule } from '../overview/useOverview'
import { useOverviewWords } from '../overview/words'
import type { Panel } from '../overview/types'
import { MobileTile, MobileTitle } from './MobileUI'
import { mobileIcons } from './assets'
import { useMobileWords } from './words'

export function MobileHome() {
  const say = useMobileWords()
  const words = useOverviewWords()
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const location = useLocation()
  const navigate = useNavigate()
  const period = periodFrom(location.search)
  const filter = filterFrom(location.search)
  const [picker, setPicker] = useState(false)
  const rawPanel = new URLSearchParams(location.search).get('panel')
  const panel = (['program', 'preview', 'issues', 'numbers', 'activity', 'requests'].includes(rawPanel ?? '') ? rawPanel : null) as Panel | null
  const setPanel = (value: Panel | null) => { const next = new URLSearchParams(location.search); if (value) next.set('panel', value); else next.delete('panel'); navigate({ search: next.toString() }, { replace: !value }) }
  const go = (change: Parameters<typeof overviewSearch>[1]) => navigate({ search: overviewSearch(location.search, change) }, { replace: true })
  const online = useOnline()
  const summary = useOverviewModule('summary', period)
  const checks = useOverviewModule('checks', period)
  const metrics = useOverviewModule('metrics', period)
  const queue = useOverviewModule('queue', period)
  const activity = useOverviewModule('activity', period, filter)
  const s = summary.data?.data
  const m = metrics.data?.data
  const q = queue.data?.data
  const a = activity.data?.data
  const last = [summary.data, checks.data, metrics.data, queue.data, activity.data].flatMap(x => x ? [x.as_of] : []).sort()[0]
  const stale = !online || [summary, checks, metrics, queue, activity].some(x => x.isError && x.data)
  const panels = { program: words('programPanel'), preview: words('previewPanel'), issues: words('issuesPanel'), numbers: words('about'), activity: words('activity'), requests: words('requestsPanel') }
  return <div className="l-ov-page l-mw-page l-mw-home"><MobileTitle>{say('home')}</MobileTitle>
    {!online && <p role="status" className="l-mw-panel">{words('offline')}</p>}
    {!s && (summary.isError ? <OverviewRecovery onRetry={() => { void summary.refetch() }} forbidden={summary.forbidden} /> : <OverviewSkeleton rows={5} />)}
    {s && !s.configured ? <><section className="l-mw-panel l-mw-first"><h2>{say('start')}</h2><p>{say('startHint')}</p>{boot.staff.can.manage_program && <Link className="l-ov-button l-ov-primary" to="/loyalty/options/setup">{words('startSetup')}</Link>}</section><section className="l-mw-panel"><h2>{say('decisions')}</h2><ol className="l-mw-decisions">{(['earn', 'receive', 'invite'] as const).map((key, i) => <li key={key}><strong>0{i + 1} {say(key)}</strong><small>{say(`${key}Hint`)}</small></li>)}</ol></section><h2>{say('helpChoosing')}</h2><Link className="l-ov-button" to="/loyalty/guide">{say('setupGuide')}</Link><p>{say('dashboardLater')}</p></> : s && <>
      <div className="l-mw-tiles"><MobileTile primary icon={mobileIcons.scan} title={words('scan')} hint={say('cameraReader')} to="/loyalty/scan" /><MobileTile icon={mobileIcons.members} title={say('findMember')} hint={say('searchMembers')} to="/loyalty" /><MobileTile icon={mobileIcons.requests} title={t('loyalty.nav.requests', 'Requests')} hint={q ? say('waiting', { count: q.total }) : words('sourceUnavailable')} to="/loyalty/requests" /><MobileTile icon={mobileIcons.members} title={t('loyalty.membership.list.add', 'Add member')} hint={say('createMember')} to="/loyalty?add=1" /></div>
      {queue.isError && <OverviewRecovery onRetry={() => { void queue.refetch() }} forbidden={queue.forbidden} />}
      {boot.staff.can.view_insights && <><div className="l-mw-glance"><h2>{words('glance')}</h2><OverviewButton onClick={() => setPicker(true)} aria-haspopup="dialog">{words(`period${period}`)} ▾</OverviewButton></div>
      {metrics.isError && <OverviewRecovery onRetry={() => { void metrics.refetch() }} forbidden={metrics.forbidden} />}
      <div className="l-mw-metrics">{m ? m.items.filter(item => item.key !== 'points_available').slice(0, 2).map(item => <button key={item.key} className="l-mw-metric" onClick={() => setPanel('numbers')}><span>{words(item.key)}</span><strong>{item.value === null ? '—' : points(item.value, i18n.language)}</strong><small>{item.key === 'members' ? `+${points(m.joined, i18n.language)} ${t('loyalty.members.col_joined', 'Joined')}` : item.kind === 'current' ? words('current') : t('loyalty.requestdesign.completed', 'Fulfilled')}</small></button>) : <OverviewSkeleton rows={3} />}</div>
      <section className="l-mw-panel l-mw-latest"><h2>{say('latest')}</h2>{activity.isError ? <OverviewRecovery onRetry={() => { void activity.refetch() }} forbidden={activity.forbidden} /> : !a ? <OverviewSkeleton rows={2} /> : a.items.length ? <ActivityRows items={a.items.slice(0, 1)} filter={filter} onClear={() => go({ activity: 'all' })} /> : <p>{say('activityEmpty')}</p>}<button className="l-ov-link" onClick={() => setPanel('activity')}>{words('viewActivity')} →</button></section></>}
      {last && <small className="l-mw-updated" role="status">{words(stale ? 'cached' : 'updated', { time: when(last, i18n.language, boot.venue.timezone) })}</small>}
      {checks.isError && <OverviewRecovery onRetry={() => { void checks.refetch() }} forbidden={checks.forbidden} />}
      {!!checks.data?.data.warnings && <button className="l-mw-panel l-mw-attention" onClick={() => setPanel('issues')}>{words(checks.data.data.warnings === 1 ? 'reviewOne' : 'reviewCount', { count: checks.data.data.warnings })} →</button>}
    </>}
    {picker && <OverviewDialog kind="form" className="l-mw-sheet" title={words('activityPeriod')} onClose={() => setPicker(false)}>{PERIODS.map(p => <OverviewButton key={p} aria-pressed={p === period} onClick={() => { go({ period: p }); setPicker(false) }}>{words(`period${p}`)}{p === period ? ' ✓' : ''}</OverviewButton>)}</OverviewDialog>}
    {panel && <OverviewDialog title={panels[panel]} onClose={() => setPanel(null)}><OverviewDetails panel={panel} summary={summary} checks={checks} metrics={metrics} queue={queue} activity={activity} period={period} filter={filter} onFilter={value => go({ activity: value })} /></OverviewDialog>}
  </div>
}
