import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, CalendarDays, CheckCircle2, Plus, Send, Sparkles } from 'lucide-react'
import type { PlannerProfile, Pillar, Post, Readiness, Strategy } from './lib'
import { cp, dateOnly, fmtDateISO, PLATFORM_META, STATUS_META, WEEKDAY_ROLE_META, WEEKDAYS } from './lib'

interface Props {
  profile: PlannerProfile
  readiness?: Readiness
  onNavigate: (tab: 'strategy' | 'calendar' | 'posts' | 'setup') => void
}

function Card({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          {title && <h3 className="text-sm font-semibold text-white">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Send; label: string; value: string | number; color: string }) {
  return (
    <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wide text-t-secondary truncate">{label}</p>
          <p className="text-2xl font-bold text-white mt-1">{value}</p>
        </div>
        <Icon size={22} style={{ color }} className="opacity-60 shrink-0" />
      </div>
    </div>
  )
}

const RING_R = 26
const RING_C = 2 * Math.PI * RING_R

export function Dashboard({ profile, readiness, onNavigate }: Props) {
  const { data: postsResp, isLoading: postsLoading } = useQuery({
    queryKey: ['cp-posts', 'dash', profile.id],
    queryFn: () => {
      const now = new Date()
      const from = new Date(now)
      from.setDate(now.getDate() - 7)
      const to = new Date(now)
      to.setDate(now.getDate() + 30)
      return cp.listPosts({ planner_profile_id: profile.id, from: fmtDateISO(from), to: fmtDateISO(to) })
    },
  })
  const { data: stratResp } = useQuery({
    queryKey: ['cp-strategies', profile.id],
    queryFn: () => cp.listStrategies(profile.id),
  })

  const posts: Post[] = postsResp?.data ?? []
  const strategies: Strategy[] = stratResp?.data ?? []
  const currentStrategy =
    strategies.find(s => s.status === 'active') ??
    [...strategies].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
  const allPillars: Pillar[] = currentStrategy?.pillars ?? []
  const pillars = allPillars.some(p => p.active) ? allPillars.filter(p => p.active) : allPillars

  const monthKey = fmtDateISO(new Date()).slice(0, 7)
  const inCurrentMonth = (p: Post) => (dateOnly(p.scheduled_date) ?? '').startsWith(monthKey)
  const plannedThisMonth = posts.filter(p => inCurrentMonth(p) && p.status !== 'archived' && p.status !== 'skipped').length
  const readyCount = posts.filter(p => p.status === 'ready_to_publish').length
  const publishedThisMonth = posts.filter(p => p.status === 'published' && inCurrentMonth(p)).length

  const readinessPct = Math.max(0, Math.min(100, readiness?.overall ?? profile.knowledge_score ?? 0))
  const gaps = (readiness?.sections ?? []).filter(s => s.score < 70)

  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  const statusCounts = Object.entries(STATUS_META)
    .map(([key, meta]) => ({ key, meta, count: posts.filter(p => p.status === key).length }))
    .filter(s => s.count > 0)

  const stat = (v: number) => (postsLoading ? '—' : v)

  return (
    <div className="space-y-4">
      {/* Top cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-dark-border bg-dark-surface p-4">
          <div className="flex items-center gap-3">
            <svg width="64" height="64" viewBox="0 0 64 64" className="shrink-0">
              <circle cx="32" cy="32" r={RING_R} fill="none" stroke="rgba(139,92,246,0.15)" strokeWidth="6" />
              <circle
                cx="32" cy="32" r={RING_R} fill="none"
                stroke="#8b5cf6" strokeWidth="6" strokeLinecap="round"
                strokeDasharray={`${(readinessPct / 100) * RING_C} ${RING_C}`}
                transform="rotate(-90 32 32)"
              />
              <text x="32" y="37" textAnchor="middle" fontSize="14" fontWeight="700" fill="#ffffff">{readinessPct}%</text>
            </svg>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary">Readiness</p>
              <button
                onClick={() => onNavigate('setup')}
                className="mt-1 inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Improve setup <ArrowRight size={12} />
              </button>
            </div>
          </div>
        </div>
        <StatCard icon={CalendarDays} label="Planned this month" value={stat(plannedThisMonth)} color="#60a5fa" />
        <StatCard icon={Send} label="Ready to publish" value={stat(readyCount)} color="#10b981" />
        <StatCard icon={CheckCircle2} label="Published this month" value={stat(publishedThisMonth)} color="#22c55e" />
      </div>

      {/* This week's plan */}
      <Card
        title="This Week's Plan"
        action={
          <button
            onClick={() => onNavigate('calendar')}
            className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
          >
            Open calendar <ArrowRight size={12} />
          </button>
        }
      >
        <div className="overflow-x-auto">
          <div className="grid grid-cols-7 gap-2 min-w-[840px]">
            {weekDays.map((d, i) => {
              const iso = fmtDateISO(d)
              const dayKey = WEEKDAYS[(d.getDay() + 6) % 7]
              const role = profile.weekly_rhythm?.[dayKey]?.role
              const roleLabel = role ? (WEEKDAY_ROLE_META[role]?.label ?? role) : null
              const dayPosts = posts
                .filter(p => dateOnly(p.scheduled_date) === iso && p.status !== 'archived')
                .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))
              return (
                <div key={iso} className={`rounded-lg border p-2 ${i === 0 ? 'border-violet-500/40 bg-violet-500/5' : 'border-dark-border bg-dark-surface2'}`}>
                  <p className="text-[11px] font-semibold text-white">
                    {d.toLocaleDateString(undefined, { weekday: 'short' })}{' '}
                    <span className="text-t-secondary font-normal">{d.getDate()}</span>
                  </p>
                  {roleLabel && <p className="text-[10px] text-violet-300/80 mt-0.5 truncate">{roleLabel}</p>}
                  <div className="mt-2 space-y-1">
                    {dayPosts.length === 0 && <p className="text-xs text-t-secondary">—</p>}
                    {dayPosts.map(p => (
                      <div
                        key={p.id}
                        className="flex items-center gap-1.5 rounded px-1.5 py-1"
                        style={{ background: STATUS_META[p.status]?.bg ?? 'rgba(156,163,175,0.15)' }}
                        title={p.topic ?? p.title ?? undefined}
                      >
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PLATFORM_META[p.platform]?.color ?? '#9ca3af' }} />
                        <span className="truncate text-[11px]" style={{ color: STATUS_META[p.status]?.color ?? '#9ca3af' }}>
                          {p.topic || p.title || 'Untitled'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Pillar balance */}
        <Card title="Pillar balance">
          {pillars.length === 0 ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-t-secondary">Generate a strategy to define pillars</p>
              <button
                onClick={() => onNavigate('strategy')}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-1.5 text-sm font-medium text-white transition-colors"
              >
                <Sparkles size={13} /> Generate strategy
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {pillars.map(p => {
                const w = Math.max(0, Math.min(100, p.frequency_weight ?? 0))
                return (
                  <div key={p.id}>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-white truncate">{p.name}</span>
                      <span className="text-t-secondary shrink-0">{w}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-dark-surface3 mt-1">
                      <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-violet-400" style={{ width: `${w}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        {/* Setup gaps */}
        <Card title="Setup gaps">
          {!readiness ? (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-t-secondary">Readiness has not been computed yet.</p>
              <button
                onClick={() => onNavigate('setup')}
                className="inline-flex items-center gap-1 text-xs text-violet-400 hover:text-violet-300 transition-colors"
              >
                Review setup <ArrowRight size={12} />
              </button>
            </div>
          ) : gaps.length === 0 ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-200">Setup looks strong — all sections score 70% or higher.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {gaps.map(s => (
                <div key={s.key}>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-white truncate">{s.label}</span>
                    <span className="text-amber-400 shrink-0">{s.score}%</span>
                  </div>
                  {s.hints[0] && <p className="text-[11px] text-t-secondary mt-0.5">{s.hints[0]}</p>}
                  <div className="h-1.5 rounded-full bg-dark-surface3 mt-1">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(0, Math.min(100, s.score))}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* Status board */}
        <Card title="Post statuses">
          {statusCounts.length === 0 ? (
            <p className="text-sm text-t-secondary">No posts in the current window yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {statusCounts.map(s => (
                <span
                  key={s.key}
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
                  style={{ background: s.meta.bg, color: s.meta.color }}
                >
                  {s.meta.label}
                  <span className="font-bold">{s.count}</span>
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Quick actions */}
        <Card title="Quick actions">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onNavigate('strategy')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 px-3 py-2 text-sm font-medium text-white transition-colors"
            >
              <Sparkles size={14} /> Generate strategy
            </button>
            <button
              onClick={() => onNavigate('calendar')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface2 hover:border-dark-border2 px-3 py-2 text-sm text-gray-300 transition-colors"
            >
              <CalendarDays size={14} /> Plan this month
            </button>
            <button
              onClick={() => onNavigate('posts')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dark-border bg-dark-surface2 hover:border-dark-border2 px-3 py-2 text-sm text-gray-300 transition-colors"
            >
              <Plus size={14} /> New post
            </button>
          </div>
        </Card>
      </div>
    </div>
  )
}
