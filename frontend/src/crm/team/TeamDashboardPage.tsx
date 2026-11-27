import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowRight, CalendarClock, Check, ChevronLeft, ChevronRight, ClipboardCheck, Expand, LayoutDashboard, ListTodo, Mail, Monitor, Pause, Play, RefreshCw, Sparkles, UserPlus, X } from 'lucide-react'
import { useBoot } from '../CrmProvider'
import { useNow } from '../../hooks/useNow'
import { useMedia } from '../../workspace/lib/useMedia'
import { get, params } from '../lib/api'
import { currentBrand } from '../lib/brand'
import { count, money, timeAgo } from '../lib/format'
import { actionLink, boardDay, boardView, teamOptions, type BoardView, type Filter, type Kind, type TeamAction, type TeamBoard } from './teamBoard'
import { TeamOverview } from './TeamOverview'
import './team.css'

const icons = { email: Mail, followup: CalendarClock, delivery: ClipboardCheck, new: UserPlus }
const filters: Filter[] = ['all','urgent','email','delivery','followup','new']

function Presentation({ children, close }: { children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const onExit = useRef(close)
  useEffect(() => { onExit.current = close }, [close])
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    let entered = Boolean(document.fullscreenElement)
    const changed = () => {
      if (entered && !document.fullscreenElement) onExit.current()
      entered = Boolean(document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', changed)
    return () => {
      document.removeEventListener('fullscreenchange', changed)
      dialog?.close()
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
    }
  }, [])
  return <dialog className="crm-team-tv" ref={ref} aria-labelledby="crm-team-heading" onCancel={e => { e.preventDefault(); close() }}>{children}</dialog>
}

export function TeamDashboardPage() {
  const { t, i18n } = useTranslation()
  const boot = useBoot()
  const [sp, setSp] = useSearchParams()
  const { period, filter, tv, page } = teamOptions(sp)
  const view = boardView(sp)
  const reduced = useMedia('(prefers-reduced-motion: reduce)')
  const rotating = tv && !reduced && sp.get('rotate') !== 'off'
  const brand = currentBrand()
  const board = useQuery({ queryKey: ['crm', 'team-dashboard', boot.organization.id, brand, period, filter, page, tv],
    queryFn: () => get<TeamBoard>('crm/team-dashboard' + params({ period, filter, page, size: tv ? 4 : 8 })),
    staleTime: 15_000, refetchInterval: 60_000, refetchIntervalInBackground: true, retry: 1 })
  const change = (key: string, value: string) => setSp(old => {
    const next = new URLSearchParams(old)
    if (key !== 'page') next.delete('page')
    if (tv && key !== 'display') next.set('rotate', 'off')
    if (value) next.set(key, value); else next.delete(key)
    return next
  })
  const close = useCallback(() => setSp(old => { const next = new URLSearchParams(old); next.delete('display'); next.delete('rotate'); next.delete('page'); return next }, { replace: true }), [setSp])
  const chooseView = (screen: BoardView, kind?: Filter) => setSp(old => {
    const next = new URLSearchParams(old)
    next.set('view', screen)
    next.delete('page')
    if (kind) { if (kind === 'all') next.delete('filter'); else next.set('filter', kind) }
    if (tv) next.set('rotate', 'off')
    return next
  })
  const setRotation = (enabled: boolean) => setSp(old => {
    const next = new URLSearchParams(old)
    if (enabled) next.delete('rotate'); else next.set('rotate', 'off')
    return next
  }, { replace: true })
  useEffect(() => {
    if (!rotating) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      setSp(old => {
        const next = new URLSearchParams(old)
        next.set('view', boardView(old) === 'overview' ? 'actions' : 'overview')
        next.delete('page')
        return next
      }, { replace: true })
    }, 30_000)
    return () => window.clearInterval(timer)
  }, [rotating, view, setSp])
  const openTv = () => {
    if (document.fullscreenEnabled) void document.documentElement.requestFullscreen().catch(() => {})
    change('display', 'tv')
  }
  const data = board.data
  const lang = i18n.language
  const current = boot.brands?.find(b => b.id === brand)?.name ?? (brand === 'all' && (boot.brands?.length ?? 0) > 1 ? t('crm.team.all_brands') : boot.organization.name)
  const now = useNow(60_000)
  const stale = data && (now.getTime() - Date.parse(data.as_of) > 180000 || board.isError)
  const content = <div className="crm-team" data-view={view}>
    <header className="crm-team-head">
      <div><div className="crm-team-context">{current}{data && <><span aria-hidden>·</span><span>{boardDay(data.from, lang)} – {boardDay(data.through, lang)}</span></>}</div>
        <h1 id="crm-team-heading">{t('crm.team.title')}</h1></div>
      <div className="crm-team-controls">
        <div role="group" aria-label={t('crm.team.period')} className="crm-team-switch">
          {(['week','month'] as const).map(p => <button key={p} type="button" aria-pressed={period === p} onClick={() => change('period', p)}>{t(`crm.team.${p}`)}</button>)}
        </div>
        <button type="button" className="crm-team-control" onClick={tv ? close : openTv}>{tv ? <X size={17} /> : <Monitor size={17} />}{t(tv ? 'crm.team.exit_tv' : 'crm.team.tv')}</button>
        {tv && typeof document !== 'undefined' && !document.fullscreenElement && document.fullscreenEnabled && <button type="button" className="crm-team-icon" aria-label={t('crm.team.fullscreen')} onClick={() => { void document.documentElement.requestFullscreen().catch(() => {}) }}><Expand size={18} /></button>}
      </div>
    </header>
    <div className="crm-team-viewbar">
      <nav className="crm-team-views" aria-label={t('crm.team.board_views')}>
        <button type="button" aria-pressed={view === 'overview'} onClick={() => chooseView('overview')}><LayoutDashboard size={16}/>{t('crm.team.overview')}</button>
        <button type="button" aria-pressed={view === 'actions'} onClick={() => chooseView('actions', 'all')}><ListTodo size={16}/>{t('crm.team.actions')}</button>
      </nav>
      <div className="crm-team-live-controls">
        {tv && !reduced && <button key={view} type="button" className="crm-team-rotation" data-playing={rotating} aria-label={t(rotating ? 'crm.team.pause' : 'crm.team.play')} title={t(rotating ? 'crm.team.pause' : 'crm.team.play')} onClick={() => setRotation(!rotating)}>{rotating ? <Pause size={15}/> : <Play size={15}/>}<span>{t(rotating ? 'crm.team.rotating' : 'crm.team.paused')}</span></button>}
        {data && <button type="button" className="crm-team-health" data-stale={Boolean(stale)} aria-label={t('crm.team.refresh')} title={t('crm.team.refresh')} disabled={board.isFetching} onClick={() => { void board.refetch() }}>
          <i key={data.as_of} aria-hidden/><span>{t(stale ? 'crm.team.delayed' : 'crm.team.live')}</span>
          <time dateTime={data.as_of}>{new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', timeZone: boot.venue.timezone }).format(new Date(data.as_of))}</time><RefreshCw size={13}/>
        </button>}
      </div>
    </div>
    {board.isLoading && <p role="status" className="crm-team-empty">{t('crm.team.loading')}</p>}
    {(board.isError || stale) && <div role="status" className="crm-team-notice">{t(data ? 'crm.team.stale' : 'crm.team.failed')} <button type="button" onClick={() => { void board.refetch() }}>{t('crm.common.retry')}</button></div>}
    {data && view === 'overview' && <div onFocusCapture={() => { if (rotating) setRotation(false) }}>
      <TeamOverview board={data} lang={lang} showActions={kind => chooseView('actions', kind)} allCountries={sp.get('countries') === 'all'}
        setAllCountries={all => change('countries', all ? 'all' : '')}/>
    </div>}
    {data && view === 'actions' && <div className="crm-team-layout" onFocusCapture={() => { if (rotating) setRotation(false) }}>
      <section className="crm-team-queue">
        <header className="crm-team-section"><div><h2>{t('crm.team.actions')}</h2><p>{data.reviewed ? t('crm.team.reviewed', { count: data.reviewed, total: data.actions_total }) : t('crm.team.records')}</p></div>
          <select className="crm-team-filter" aria-label={t('crm.team.filter')} value={filter} onChange={e => change('filter', e.target.value)}>{filters.map(k => <option key={k} value={k}>{t(`crm.team.filter_${k}`)}</option>)}</select>
        </header>
        {data.actions.length ? <ol className="crm-team-list" start={(data.page - 1) * (tv ? 4 : 8) + 1}>
          {data.actions.map(a => <ActionRow key={a.key} item={a} lang={lang} />)}
        </ol> : <div className="crm-team-empty"><Check size={26} aria-hidden /><p>{t('crm.team.empty')}</p></div>}
        <footer className="crm-team-foot"><span>{t('crm.team.action_count', { count: data.matching })}</span>
          {data.pages > 1 && <nav aria-label={t('crm.common.pages')}><button className="crm-team-icon" type="button" disabled={data.page <= 1} aria-label={t('crm.common.previous')} onClick={() => change('page', String(data.page - 1))}><ChevronLeft size={17}/></button>
            <span>{data.page} / {data.pages}</span><button className="crm-team-icon" type="button" disabled={data.page === data.pages} aria-label={t('crm.common.next')} onClick={() => change('page', String(data.page + 1))}><ChevronRight size={17}/></button></nav>}
        </footer>
      </section>
      <aside className="crm-team-ledger" aria-label={t('crm.team.performance')}>
        <section className="crm-team-period"><h2>{t(`crm.team.${period}`)}</h2>
          <dl className="crm-team-totals"><div><dt>{t('crm.team.leads')}</dt><dd>{count(data.leads, lang)}</dd></div><div><dt>{t('crm.team.wins')}</dt><dd>{count(data.wins, lang)}</dd></div></dl>
          <ActivityChart data={data} lang={lang} />
          {data.undated_wins > 0 && <details className="crm-team-history"><summary>{t('crm.team.win_dates')}</summary><p>{t('crm.team.undated', { count: data.undated_wins })}</p></details>}
        </section>
        <section className="crm-team-backlog"><div className="crm-team-backlog-head"><Mail size={19} aria-hidden/><h2>{t('crm.team.unanswered')}</h2></div>
          <div className="crm-team-backlog-value">{count(data.emails, lang)}</div><p>{t(period === 'week' ? 'crm.team.received_week' : 'crm.team.received_month', { count: data.period_emails })}</p>
          <button type="button" aria-pressed={filter === 'email'} onClick={() => change('filter', filter === 'email' ? 'all' : 'email')}>{t(filter === 'email' ? 'crm.team.show_all' : 'crm.team.view_emails')}<ArrowRight size={16} /></button>
        </section>
      </aside>
    </div>}
  </div>
  return tv ? <Presentation close={close}>{content}</Presentation> : content
}

function ActionRow({ item, lang }: { item: TeamAction; lang: string }) {
  const { t } = useTranslation()
  const Icon = icons[item.kind]
  const kind: Kind | 'review' = item.kind === 'email' && ['automated','information_only'].includes(item.ai_reason ?? '') ? 'review' : item.kind
  const facts = item.signals.filter(k => k !== 'waiting').map(k => {
    if (k === 'delivery_due' && item.deadline) return t('crm.team.delivery_date', { date: boardDay(item.deadline, lang) })
    if (k === 'large_order' && item.quantity) return t('crm.team.units', { count: item.quantity })
    if (k === 'high_value') return money(item.amount, item.currency, lang)
    return t(`crm.team.signal_${k}`)
  })
  const reason = item.ai_reason && item.ai_reason !== 'routine' ? t(`crm.team.ai_${item.ai_reason}`) : ''
  return <li><Link className="crm-team-row" data-priority={item.priority} to={actionLink(item)}>
    <span className="crm-team-row-icon" aria-hidden><Icon size={20}/></span>
    <div className="crm-team-item"><div className="crm-team-row-meta"><span>{t(`crm.team.kind_${kind}`)}</span><span className="crm-team-level">{t(`crm.team.level_${item.priority}`)}</span></div>
      <h3>{item.company || item.name || t('crm.team.unnamed', { id: item.lead_id })}</h3>
      {item.subject && <p className="crm-team-subject">{item.subject}</p>}
      <div className="crm-team-facts">{reason && <span><Sparkles size={12} aria-hidden/>{reason}</span>}{facts.slice(0, 3).map(f => <span key={f}>{f}</span>)}
        {item.kind === 'email' && <span>{timeAgo(new Date(item.at * 1000).toISOString(), lang)}</span>}
        {item.owner && <span>{item.owner}</span>}</div>
    </div><ArrowRight size={17} aria-hidden className="crm-team-row-arrow"/>
  </Link></li>
}

function ActivityChart({ data, lang }: { data: TeamBoard; lang: string }) {
  const { t } = useTranslation()
  const max = Math.max(1, ...data.days.flatMap(d => [d.leads, d.wins]))
  return <figure className="crm-team-chart" aria-label={t('crm.team.trend')}><div className="crm-team-bars">
    {data.days.map(day => <div key={day.date} title={t('crm.team.day_counts', { date: boardDay(day.date, lang), leads: day.leads, wins: day.wins })}>
      <i style={{ height: (day.leads / max * 100) + '%' }} /><i style={{ height: (day.wins / max * 100) + '%' }} />
    </div>)}
  </div><div className="crm-team-axis"><span>{boardDay(data.from, lang)}</span>{data.from !== data.through && <span>{boardDay(data.through, lang)}</span>}</div>
    <figcaption><span>{t('crm.team.leads')}</span><span>{t('crm.team.wins')}</span></figcaption></figure>
}
