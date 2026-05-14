import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Activity, AlertTriangle, Coins, CheckCircle2, Cpu, Layers } from 'lucide-react'
import { api } from '../lib/api'

interface Budget {
  status: 'unlimited' | 'under' | 'warn' | 'over'
  used_cents: number
  cap_cents: number | null
  percent: number | null
}

interface ModelRow { model: string; cost_cents: number; calls: number }
interface FeatureRow { feature: string; cost_cents: number; calls: number }

interface StatsResponse {
  budget: Budget
  total_calls: number
  total_tokens: number
  allowed_models: string[] | null
  by_model: ModelRow[]
  by_feature: FeatureRow[]
}

interface SeriesPoint { day: string; cost_cents: number; calls: number }

function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

const STATUS_META = {
  unlimited: { label: 'Unlimited', color: '#a3a3a3', bg: 'rgba(163,163,163,0.10)', icon: Activity },
  under:     { label: 'Healthy',   color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   icon: CheckCircle2 },
  warn:      { label: '80%+',      color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: AlertTriangle },
  over:      { label: 'Over plan', color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   icon: AlertTriangle },
} as const

export function AiUsagePanel() {
  const { data: stats, isLoading } = useQuery<StatsResponse>({
    queryKey: ['ai-usage-stats'],
    queryFn: () => api.get('/v1/admin/ai-usage/stats').then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: series } = useQuery<{ data: SeriesPoint[] }>({
    queryKey: ['ai-usage-series'],
    queryFn: () => api.get('/v1/admin/ai-usage/series?days=30').then(r => r.data),
  })

  const seriesPeak = useMemo(() => {
    if (!series?.data?.length) return 1
    return Math.max(1, ...series.data.map(d => d.cost_cents))
  }, [series])

  if (isLoading || !stats) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-8 text-center text-sm text-gray-400">
        Loading usage…
      </div>
    )
  }

  const budgetMeta = STATUS_META[stats.budget.status]
  const BudgetIcon = budgetMeta.icon

  return (
    <div className="space-y-5">
      {/* KPI strip — month-to-date snapshot */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {/* Cost */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
            <Coins size={12} /> Spent this month
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">{dollars(stats.budget.used_cents)}</div>
          {stats.budget.cap_cents != null && (
            <div className="text-xs text-gray-500 mt-1">
              of {dollars(stats.budget.cap_cents)} cap · {stats.budget.percent ?? 0}%
            </div>
          )}
        </div>

        {/* Status */}
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: budgetMeta.bg }}>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide" style={{ color: budgetMeta.color }}>
            <BudgetIcon size={12} /> Budget status
          </div>
          <div className="mt-2 text-2xl font-semibold" style={{ color: budgetMeta.color }}>
            {budgetMeta.label}
          </div>
          {stats.budget.cap_cents != null && (
            <div className="mt-2 h-1.5 w-full rounded-full bg-white/[0.05] overflow-hidden">
              <div className="h-full rounded-full" style={{
                width: `${Math.min(100, stats.budget.percent ?? 0)}%`,
                background: budgetMeta.color,
              }} />
            </div>
          )}
        </div>

        {/* Calls */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
            <Activity size={12} /> AI calls
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">{stats.total_calls.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">
            {(stats.total_tokens / 1_000).toFixed(1)}k tokens
          </div>
        </div>

        {/* Allowed models */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-400">
            <Cpu size={12} /> Plan models
          </div>
          <div className="mt-2 text-2xl font-semibold text-white">
            {stats.allowed_models == null ? 'All' : stats.allowed_models.length}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {stats.allowed_models == null ? 'No restriction' : 'Restricted by plan'}
          </div>
        </div>
      </div>

      {/* Over-cap banner */}
      {stats.budget.status === 'over' && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/[0.08] p-4 text-sm text-red-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} /> You've hit your plan's monthly AI cap
          </div>
          <p className="mt-1 text-red-200/80">
            AI features still work for now — we're tracking-only on the cap.
            Contact billing if you'd like a higher cap on your plan.
          </p>
        </div>
      )}
      {stats.budget.status === 'warn' && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] p-4 text-sm text-amber-200">
          <div className="flex items-center gap-2 font-medium">
            <AlertTriangle size={14} /> Approaching your monthly AI cap
          </div>
          <p className="mt-1 text-amber-200/80">
            You've used {stats.budget.percent}% of your plan's AI budget for this month.
          </p>
        </div>
      )}

      {/* 30-day sparkline */}
      {series?.data && series.data.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">Last 30 days</div>
          <div className="flex items-end gap-1 h-20">
            {series.data.map(d => (
              <div
                key={d.day}
                className="flex-1 rounded-sm bg-blue-500/40 hover:bg-blue-500/60 transition-colors"
                style={{ height: `${Math.max(4, (d.cost_cents / seriesPeak) * 100)}%` }}
                title={`${d.day.slice(0, 10)} · ${dollars(d.cost_cents)} · ${d.calls} calls`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Breakdown — by model + by feature */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
            <Cpu size={14} /> By model
          </div>
          {stats.by_model.length === 0 ? (
            <div className="text-xs text-gray-500 py-4">No AI calls this month yet.</div>
          ) : (
            <div className="space-y-2">
              {stats.by_model.map(row => (
                <div key={row.model} className="flex items-center justify-between text-sm">
                  <div className="text-gray-300 truncate pr-3" title={row.model}>{row.model}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-500 text-xs">{row.calls.toLocaleString()} calls</span>
                    <span className="text-white tabular-nums">{dollars(row.cost_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white mb-3">
            <Layers size={14} /> By feature
          </div>
          {stats.by_feature.length === 0 ? (
            <div className="text-xs text-gray-500 py-4">No AI calls this month yet.</div>
          ) : (
            <div className="space-y-2">
              {stats.by_feature.map(row => (
                <div key={row.feature} className="flex items-center justify-between text-sm">
                  <div className="text-gray-300 truncate pr-3" title={row.feature}>{row.feature}</div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-gray-500 text-xs">{row.calls.toLocaleString()} calls</span>
                    <span className="text-white tabular-nums">{dollars(row.cost_cents)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Allowed-models list — only when restricted */}
      {stats.allowed_models && stats.allowed_models.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <div className="text-xs uppercase tracking-wide text-gray-400 mb-2">Allowed by your plan</div>
          <div className="flex flex-wrap gap-2">
            {stats.allowed_models.map(m => (
              <span key={m} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-white/[0.04] border border-white/[0.06] text-gray-300">
                <Cpu size={10} /> {m}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Calls to other models will fail with a "model not included in plan" error.
            Upgrade your plan to unlock more capable models.
          </p>
        </div>
      )}
    </div>
  )
}
