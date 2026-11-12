import type { CSSProperties, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { LucideIcon } from 'lucide-react'
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Cake, CalendarCheck, CheckCircle2, ChevronRight, Clock, Crown, Lock, Minus,
  Sparkle, Sparkles,
} from 'lucide-react'
import { DASH_HUE, fill, ink } from '../../theme/dashboardPalette'
import { changeText, ringArcs, trendOf, type Total } from './dashboardMath'
import { Ring, Sparkline } from './charts'
import { useCountUp } from './hooks'

/**
 * The dashboard's cards. Each one fades up into place in turn (`--i`, dashboard.css) and hides its own empty parts;
 * every figure arrives from the server and is only placed, formatted and drawn here.
 */

export function Card({ index = 0, title, sub, icon: Icon, hue = DASH_HUE.blue, actions, children, className = '', bodyClassName = '', labelledBy }: {
  index?: number
  title: string
  sub?: ReactNode
  icon: LucideIcon
  hue?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
  labelledBy?: string
}) {
  const id = labelledBy ?? `dash-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  return (
    <section className={`dash-card flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-dark-border bg-dark-surface ${className}`} style={{ '--i': index } as CSSProperties} aria-labelledby={id}>
      <header className="flex items-center gap-3 border-b border-dark-border px-5 pb-3 pt-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: fill(hue, 0.14), color: ink(hue) }}>
          <Icon size={17} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={id} className="truncate text-sm font-bold text-white">{title}</h2>
          {sub && <p className="truncate text-[11px] text-t-muted">{sub}</p>}
        </div>
        {actions}
      </header>
      <div className={`min-w-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  )
}

/** A figure counting up, with the final value said once to screen readers. */
export function CountUp({ value, format, className = '' }: { value: number; format: (v: number) => string; className?: string }) {
  const shown = useCountUp(value)
  return (
    <span className={className}>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}

/** The change against the period before, as a chip: up in green, down in red, "new" when there was nothing before. */
export function ChangeChip({ total }: { total: Total | null | undefined }) {
  const { t, i18n } = useTranslation()
  const trend = trendOf(total)
  if (!total || (trend === 'flat' && total.current === 0)) return null
  const hue = trend === 'up' || trend === 'new' ? DASH_HUE.emerald : trend === 'down' ? DASH_HUE.red : DASH_HUE.indigo
  const Icon = trend === 'up' ? ArrowUpRight : trend === 'down' ? ArrowDownRight : trend === 'new' ? Sparkle : Minus
  const text = trend === 'new' ? t('dashboard.kpi.new', 'New') : changeText(total.change, i18n.language)
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
      style={{ background: fill(hue, 0.14), color: ink(hue) }}>
      <Icon size={11} aria-hidden="true" />{text}
    </span>
  )
}

export interface KpiSpec {
  key: string
  label: string
  sub: string
  icon: LucideIcon
  hue: string
  total: Total
  series: number[]
  format: (v: number) => string
  to?: string
}

/** A period figure: its label, the total counting up, the change, and its days as a sparkline. */
export function KpiTile({ spec, index, previousLabel, wide = false }: { spec: KpiSpec; index: number; previousLabel: string; wide?: boolean }) {
  const Icon = spec.icon
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-t-muted">{spec.label}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" style={{ background: fill(spec.hue, 0.14), color: ink(spec.hue) }}>
          <Icon size={14} aria-hidden="true" />
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <CountUp value={spec.total.current} format={spec.format} className="text-2xl font-bold leading-tight tabular-nums text-white" />
        <ChangeChip total={spec.total} />
      </div>
      <p className="mt-0.5 truncate text-[10px] text-t-muted" title={`${spec.sub} · ${previousLabel.replace('{{value}}', spec.format(spec.total.previous))}`}>
        {spec.sub} · {previousLabel.replace('{{value}}', spec.format(spec.total.previous))}
      </p>
      <div className="-mx-1 mt-2">
        <Sparkline values={spec.series} hue={spec.hue} height={wide ? 40 : 34} />
      </div>
    </>
  )
  const className = 'dash-card dash-lift group block h-full min-w-0 rounded-2xl border border-dark-border bg-dark-surface p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400'
  const style = { '--i': index, '--lift': fill(spec.hue, 0.35) } as CSSProperties
  return spec.to
    ? <Link to={spec.to} className={className} style={style}>{body}</Link>
    : <div className={className} style={style}>{body}</div>
}

/** A point-in-time figure the venue's industry chose (occupancy, arrivals today…), smaller than a period figure. */
export function StatTile({ label, value, sub, icon: Icon, hue, to, index }: { label: string; value: string; sub?: string | null; icon: LucideIcon; hue: string; to?: string | null; index: number }) {
  const body = (
    <div className="flex items-center gap-3">
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex" style={{ background: fill(hue, 0.14), color: ink(hue) }}>
        <Icon size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="line-clamp-2 text-[10px] font-bold uppercase leading-tight tracking-wider text-t-muted">{label}</p>
        <p className="truncate text-base font-bold leading-tight tabular-nums text-white sm:text-lg" title={value}>{value}</p>
        {sub && <p className="truncate text-[10px] text-t-muted">{sub}</p>}
      </div>
    </div>
  )
  const className = 'dash-card dash-lift block min-w-0 rounded-2xl border border-dark-border bg-dark-surface px-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400'
  const style = { '--i': index, '--lift': fill(hue, 0.3) } as CSSProperties
  return to ? <Link to={to} className={className} style={style}>{body}</Link> : <div className={className} style={style}>{body}</div>
}

export interface LiveRow { key: string; label: string; value: number; icon: LucideIcon; hue: string; to: string; urgent?: boolean }

/** What is happening now: the counts that need a person first, then the calm ones; a green line when nothing waits. */
export function LiveCard({ rows, online, index }: { rows: LiveRow[]; online: number | null; index: number }) {
  const { t } = useTranslation()
  const waiting = rows.filter(r => r.value > 0)
  return (
    <Card index={index} title={t('dashboard.live.title', 'Live now')} icon={Clock} hue={DASH_HUE.red}
      sub={online !== null ? t('dashboard.live.online', '{{count}} on the website now', { count: online }) : t('dashboard.live.sub', 'Refreshes every 30 seconds')}
      actions={<span className="dash-live-dot h-2.5 w-2.5 rounded-full" style={{ background: fill(DASH_HUE.emerald) }} aria-hidden="true" />}>
      {waiting.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-5 py-8 text-center">
          <span className="dash-pop flex h-12 w-12 items-center justify-center rounded-full" style={{ background: fill(DASH_HUE.emerald, 0.14), color: ink(DASH_HUE.emerald) }}>
            <CheckCircle2 size={22} aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold text-white">{t('dashboard.all_clear', 'All clear.')}</p>
          <p className="text-[11px] text-t-muted">{t('dashboard.all_clear_sub', 'Nothing waiting on you right now.')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-dark-border">
          {rows.map(r => {
            const Icon = r.icon
            return (
              <li key={r.key}>
                <Link to={r.to} className={`group flex items-center gap-3 px-5 py-2.5 transition-colors hover:bg-dark-surface2 ${r.value === 0 ? 'opacity-55' : ''}`}>
                  <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: fill(r.hue, 0.14), color: ink(r.hue) }}>
                    <Icon size={15} aria-hidden="true" />
                    {r.urgent && r.value > 0 && <span className="dash-live-dot absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full" style={{ background: fill(DASH_HUE.red) }} aria-hidden="true" />}
                  </span>
                  <span className="flex-1 truncate text-xs text-t-secondary group-hover:text-white">{r.label}</span>
                  <span className="text-base font-bold tabular-nums" style={{ color: r.value > 0 ? ink(r.hue) : undefined }}>
                    <CountUp value={r.value} format={v => Math.round(v).toLocaleString()} />
                  </span>
                  <ChevronRight size={13} className="text-t-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export interface PipelineSlice { key: string; label: string; count: number; value: number; hue: string }

/** The leads by stage: a ring of counts, the pipeline's value in its middle, each stage's count and value beside it. */
export function PipelineCard({ slices, money, index }: { slices: PipelineSlice[]; money: (v: number) => string; index: number }) {
  const { t } = useTranslation()
  const count = slices.reduce((a, s) => a + s.count, 0)
  const value = slices.reduce((a, s) => a + s.value, 0)
  const top = Math.max(1, ...slices.map(s => s.count))
  return (
    <Card index={index} title={t('dashboard.pipeline.title', 'Pipeline')} icon={Sparkles} hue={DASH_HUE.violet}
      sub={t('dashboard.pipeline.sub', '{{count}} leads by stage', { count })}
      actions={<Link to="/leads" className="flex items-center gap-0.5 text-[11px] font-semibold text-primary-400 hover:text-primary-300">{t('dashboard.view_all', 'View all')} <ChevronRight size={11} aria-hidden="true" /></Link>}>
      {slices.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-t-muted">{t('dashboard.pipeline.empty', 'No leads yet.')}</p>
      ) : (
        <div className="flex flex-col items-center gap-4 p-5 sm:flex-row sm:items-start">
          <Ring parts={slices.map(s => ({ key: s.key, value: s.count, hue: s.hue }))}>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-t-muted">{t('dashboard.pipeline.value', 'Value')}</span>
            <CountUp value={value} format={money} className="px-2 text-sm font-bold tabular-nums text-white" />
          </Ring>
          <ul className="w-full min-w-0 flex-1 space-y-2">
            {slices.slice(0, 6).map(s => (
              <li key={s.key} className="min-w-0">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: fill(s.hue) }} aria-hidden="true" />
                  <span className="flex-1 truncate text-t-secondary">{s.label}</span>
                  <span className="font-semibold tabular-nums text-white">{s.count}</span>
                </div>
                <div className="ml-4 mt-1 h-1 overflow-hidden rounded-full bg-dark-surface2" aria-hidden="true">
                  <div className="dash-grow h-full rounded-full" style={{ width: `${(s.count / top) * 100}%`, background: fill(s.hue) }} />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

export interface ScheduleRow { key: string; initial: string; hue: string; primary: string; secondary: string; meta: string | null; to: string }
export interface ScheduleGroup { key: string; title: string; icon: LucideIcon; hue: string; rows: ScheduleRow[]; count: number; to: string }

/** Today: arrivals, departures and services, four of each with "more" to the full list. */
export function ScheduleCard({ groups, day, index }: { groups: ScheduleGroup[]; day: string; index: number }) {
  const { t } = useTranslation()
  const total = groups.reduce((a, g) => a + g.count, 0)
  return (
    <Card index={index} title={t('dashboard.schedule.title', "Today's schedule")} sub={day} icon={CalendarCheck} hue={DASH_HUE.emerald}
      actions={<span className="text-[11px] font-semibold text-t-secondary">{t('dashboard.schedule.events', { count: total, defaultValue: '{{count}} events' })}</span>}>
      {total === 0 ? (
        <div className="px-5 py-12 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-dark-surface2">
            <CalendarCheck size={20} className="text-t-muted" aria-hidden="true" />
          </div>
          <p className="text-sm text-t-secondary">{t('dashboard.schedule.nothing_today', 'Nothing on the books for today.')}</p>
          <p className="mt-1 text-[11px] text-t-muted">{t('dashboard.schedule.future_hint', 'Future arrivals and services will appear here.')}</p>
        </div>
      ) : (
        <div className="grid divide-y divide-dark-border md:grid-cols-[repeat(auto-fit,minmax(220px,1fr))] md:divide-x md:divide-y-0">
          {groups.filter(g => g.count > 0 || groups.length <= 2).map(g => {
            const Icon = g.icon
            return (
              <div key={g.key} className="min-w-0 py-2">
                <div className="flex items-center justify-between px-4 pb-1 pt-1">
                  <div className="flex items-center gap-2">
                    <Icon size={13} style={{ color: ink(g.hue) }} aria-hidden="true" />
                    <span className="text-xs font-bold text-white">{g.title}</span>
                    <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: fill(g.hue, 0.14), color: ink(g.hue) }}>{g.count}</span>
                  </div>
                  {g.count > 4 && (
                    <Link to={g.to} className="flex items-center gap-0.5 text-[10px] font-semibold text-primary-400 hover:text-primary-300">
                      +{t('dashboard.schedule.more', { count: g.count - 4, defaultValue: '{{count}} more' })} <ChevronRight size={10} aria-hidden="true" />
                    </Link>
                  )}
                </div>
                {g.count === 0 ? (
                  <p className="px-4 pb-2 text-[11px] text-t-muted">{t('dashboard.schedule.none_today', 'None today.')}</p>
                ) : g.rows.map((r, i) => (
                  <Link key={r.key} to={r.to} className="dash-row flex items-center gap-3 px-4 py-2 transition-colors hover:bg-dark-surface2" style={{ animationDelay: `${300 + i * 70}ms` }}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold" style={{ background: fill(r.hue, 0.16), color: ink(r.hue) }}>{r.initial.toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-white">{r.primary}</span>
                      {r.secondary && <span className="block truncate text-[11px] text-t-muted">{r.secondary}</span>}
                    </span>
                    {r.meta && <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: fill(r.hue, 0.16), color: ink(r.hue) }}>{r.meta}</span>}
                  </Link>
                ))}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

export interface TierShare { key: string; name: string; count: number; colour: string | null }

/** Loyalty at a glance: how members spread over the tiers, today's birthdays, who is close to the next tier. */
export function LoyaltyCard({ tiers, birthdays, climbers, index }: {
  tiers: TierShare[]
  birthdays: { id: string | number; name: string; tier: string | null }[]
  climbers: { id: number; name: string; next: string; needed: number; progress: number }[]
  index: number
}) {
  const { t } = useTranslation()
  const total = tiers.reduce((a, s) => a + s.count, 0)
  const arcs = ringArcs(tiers.map(s => ({ key: s.key, value: s.count })), 0)
  return (
    <Card index={index} title={t('dashboard.loyalty.title', 'Members & tiers')} icon={Crown} hue={DASH_HUE.gold}
      sub={t('dashboard.loyalty.sub', '{{count}} active members', { count: total })}
      actions={<Link to="/members" className="flex items-center gap-0.5 text-[11px] font-semibold text-primary-400 hover:text-primary-300">{t('dashboard.view_all', 'View all')} <ChevronRight size={11} aria-hidden="true" /></Link>}
      bodyClassName="space-y-4 p-5">
      {total > 0 && (
        <div>
          <div className="flex h-3 overflow-hidden rounded-full bg-dark-surface2" role="img" aria-label={tiers.map(s => `${s.name} ${s.count}`).join(', ')}>
            {arcs.map((a, i) => {
              const tier = tiers.find(s => s.key === a.key)!
              return <span key={a.key} className="dash-grow h-full" style={{ width: `${a.length * 100}%`, background: tier.colour ?? fill(DASH_HUE.indigo), animationDelay: `${i * 80}ms` }} />
            })}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {tiers.map(s => (
              <li key={s.key} className="flex items-center gap-1.5 text-[11px] text-t-secondary">
                <span className="h-2 w-2 rounded-full" style={{ background: s.colour ?? fill(DASH_HUE.indigo) }} aria-hidden="true" />
                {s.name} <span className="font-semibold tabular-nums text-white">{s.count.toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-t-muted"><Cake size={12} aria-hidden="true" />{t('dashboard.loyalty.birthdays', 'Birthdays today')}</p>
        {birthdays.length === 0 ? (
          <p className="text-[11px] text-t-muted">{t('dashboard.loyalty.no_birthdays', 'No birthdays today.')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {birthdays.slice(0, 6).map(b => (
              <li key={b.id} className="rounded-full bg-dark-surface2 px-2.5 py-1 text-[11px] text-white">🎂 {b.name}{b.tier ? <span className="text-t-muted"> · {b.tier}</span> : null}</li>
            ))}
          </ul>
        )}
      </div>
      {climbers.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-t-muted">{t('dashboard.loyalty.close', 'Close to the next tier')}</p>
          <ul className="space-y-2">
            {climbers.slice(0, 3).map(c => (
              <li key={c.id}>
                <Link to={`/members/${c.id}`} className="block rounded-lg px-1 py-0.5 hover:bg-dark-surface2">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="flex-1 truncate text-white">{c.name}</span>
                    <span className="text-t-muted">{t('dashboard.loyalty.to_go', '{{points}} pts to {{tier}}', { points: c.needed.toLocaleString(), tier: c.next })}</span>
                  </div>
                  <div className="mt-1 h-1 overflow-hidden rounded-full bg-dark-surface2" aria-hidden="true">
                    <div className="dash-grow h-full rounded-full" style={{ width: `${Math.min(100, Math.max(4, c.progress))}%`, background: fill(DASH_HUE.gold) }} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

export interface AppCard { path: string; name: string; short: string; line: string; icon: LucideIcon; tint: string; locked: boolean; onLocked: () => void }

/** The HexaTech workspaces this person may open, as large cards with what each one is for. */
export function WorkspacesCard({ apps, index }: { apps: AppCard[]; index: number }) {
  const { t } = useTranslation()
  if (apps.length === 0) return null
  return (
    <section className="dash-card min-w-0" style={{ '--i': index } as CSSProperties} aria-labelledby="dash-workspaces">
      <h2 id="dash-workspaces" className="mb-2 text-[10px] font-bold uppercase tracking-wider text-t-muted">{t('dashboard.apps.title', 'Your workspaces')}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {apps.map(app => {
          const Icon = app.icon
          const inner = (
            <>
              <span className="dash-app-glow" aria-hidden="true" />
              <span className="relative flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6" style={{ background: fill(app.tint, 0.16), color: ink(app.tint) }}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.14em]" style={{ color: ink(app.tint) }}>HexaTech</span>
                  <span className="block truncate text-sm font-bold text-white" title={app.name}>{app.short}</span>
                  <span className="block text-[11px] leading-snug text-t-muted">{app.line}</span>
                </span>
                {app.locked
                  ? <Lock size={14} className="shrink-0 text-primary-400/80" aria-hidden="true" />
                  : <ArrowRight size={15} className="shrink-0 text-t-muted transition-transform duration-300 group-hover:translate-x-1" aria-hidden="true" />}
              </span>
            </>
          )
          const className = 'dash-app dash-lift group relative block overflow-hidden rounded-2xl border border-dark-border bg-dark-surface p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-400'
          const style = { '--app': fill(app.tint, 0.18), '--lift': fill(app.tint, 0.4) } as CSSProperties
          return app.locked ? (
            <button key={app.path} type="button" onClick={app.onLocked} className={`${className} opacity-70`} style={style}
              aria-label={t('nav_locked.aria_label', '{{label}} — locked, upgrade to unlock', { label: app.name })}>{inner}</button>
          ) : (
            <Link key={app.path} to={app.path} className={className} style={style} aria-label={`${app.name}: ${app.line}`}>{inner}</Link>
          )
        })}
      </div>
    </section>
  )
}

export interface TaskRow { id: number | string; title: string; due: string; overdue: boolean; priority: string }

export function TasksCard({ tasks, index }: { tasks: TaskRow[]; index: number }) {
  const { t } = useTranslation()
  const overdue = tasks.filter(x => x.overdue).length
  return (
    <Card index={index} title={t('dashboard.tasks.title', 'Follow-ups due')} icon={CheckCircle2} hue={DASH_HUE.amber}
      sub={overdue > 0 ? t('dashboard.tasks.overdue', '{{count}} overdue', { count: overdue }) : t('dashboard.tasks.sub', 'The next three days')}
      actions={<Link to="/leads" className="flex items-center gap-0.5 text-[11px] font-semibold text-primary-400 hover:text-primary-300">{t('dashboard.view_all', 'View all')} <ChevronRight size={11} aria-hidden="true" /></Link>}>
      {tasks.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-t-muted">{t('dashboard.tasks.empty', 'Nothing due in the next three days.')}</p>
      ) : (
        <ul className="divide-y divide-dark-border">
          {tasks.slice(0, 6).map((task, i) => {
            const hue = task.overdue ? DASH_HUE.red : task.priority === 'High' ? DASH_HUE.orange : DASH_HUE.amber
            return (
              <li key={task.id} className="dash-row flex items-center gap-3 px-5 py-2.5" style={{ animationDelay: `${300 + i * 60}ms` }}>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: fill(hue) }} aria-hidden="true" />
                <span className="flex-1 truncate text-xs text-white">{task.title}</span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums" style={{ color: ink(hue) }}>{task.overdue ? t('dashboard.tasks.late', 'Overdue') : task.due}</span>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

export interface ActivityRow { key: string; title: string; subtitle?: string | null; when: string; icon: LucideIcon; hue: string }

export function ActivityCard({ rows, index }: { rows: ActivityRow[]; index: number }) {
  const { t } = useTranslation()
  return (
    <Card index={index} title={t('dashboard.recent_activity', 'Recent activity')} icon={Clock} hue={DASH_HUE.cyan}
      actions={<Link to="/audit-log" className="flex items-center gap-0.5 text-[11px] font-semibold text-primary-400 hover:text-primary-300">{t('dashboard.view_all', 'View all')} <ChevronRight size={11} aria-hidden="true" /></Link>}>
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-t-muted">{t('dashboard.no_activity', 'No recent activity yet.')}</p>
      ) : (
        <ol className="relative px-5 py-3">
          <span className="absolute bottom-5 left-[35px] top-5 w-px bg-dark-border" aria-hidden="true" />
          {rows.slice(0, 7).map((row, i) => {
            const Icon = row.icon
            return (
              <li key={row.key} className="dash-row relative flex items-start gap-3 py-2" style={{ animationDelay: `${300 + i * 60}ms` }}>
                <span className="relative z-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-4 ring-dark-surface" style={{ background: fill(row.hue, 0.16), color: ink(row.hue) }}>
                  <Icon size={14} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 pt-1">
                  <span className="block truncate text-sm text-white">{row.title}</span>
                  {row.subtitle && <span className="block truncate text-[11px] text-t-muted">{row.subtitle}</span>}
                </span>
                <span className="shrink-0 pt-1.5 text-[11px] tabular-nums text-t-muted">{row.when}</span>
              </li>
            )
          })}
        </ol>
      )}
    </Card>
  )
}
