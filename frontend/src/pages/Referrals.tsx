import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Users, Trophy, Gift, TrendingUp, Search } from 'lucide-react'
import { format } from 'date-fns'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'

/**
 * Admin view onto the referral network. The data already exists —
 * referrals get written every time a member registers with a code —
 * but pre-fix there was no UI surface for staff to see who's earning
 * what or who the top advocates are.
 */
export function Referrals() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { data: stats } = useQuery({
    queryKey: ['admin-referral-stats'],
    queryFn: () => api.get('/v1/admin/referrals/stats').then(r => r.data),
  })

  const { data, isLoading } = useQuery({
    queryKey: ['admin-referrals', debouncedSearch, status, page],
    queryFn: () => api.get('/v1/admin/referrals', {
      params: { search: debouncedSearch, status: status || undefined, page },
    }).then(r => r.data),
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Referrals</h1>
        <p className="text-sm text-t-secondary mt-0.5">
          Member-to-member invites. Bonuses are awarded automatically when a new member registers using a referral code.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={<Users size={16} />} label="Total referrals" value={(stats?.total ?? 0).toLocaleString()} accent="#5ac8fa" />
        <StatCard icon={<TrendingUp size={16} />} label="Last 30 days" value={(stats?.last_30_days ?? 0).toLocaleString()} accent="#32d74b" />
        <StatCard icon={<Gift size={16} />} label="Points paid to referrers" value={(stats?.referrer_points ?? 0).toLocaleString()} accent="#c9a84c" />
        <StatCard icon={<Gift size={16} />} label="Points paid to referees" value={(stats?.referee_points ?? 0).toLocaleString()} accent="#8b5cf6" />
      </div>

      {/* Top referrers leaderboard */}
      {stats?.top_referrers?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Trophy size={16} className="text-[#c9a84c]" />
            <h2 className="text-sm font-semibold text-white">Top referrers</h2>
            <span className="text-[11px] text-[#636366]">all-time</span>
          </div>
          <div className="space-y-1">
            {stats.top_referrers.map((row: any, i: number) => {
              const m = row.referrer
              if (!m) return null
              return (
                <Link
                  key={m.id}
                  to={`/members/${m.id}`}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-dark-surface2 transition-colors"
                >
                  <div className="w-6 text-center text-xs text-[#636366]">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white truncate">{m.user?.name || '—'}</div>
                    <div className="text-[11px] text-[#636366] truncate">#{m.member_number} · code {m.referral_code}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{Number(row.count).toLocaleString()}</div>
                    <div className="text-[11px] text-[#636366]">{Number(row.points).toLocaleString()} pts</div>
                  </div>
                </Link>
              )
            })}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input
              type="text"
              placeholder="Search referrer or referee by name / email…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            className="bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">All status</option>
            <option value="rewarded">Rewarded</option>
            <option value="pending">Pending</option>
            <option value="qualified">Qualified</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-t-secondary border-b border-dark-border">
                <th className="pb-3 font-medium">Referrer</th>
                <th className="pb-3 font-medium">Referee</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3 font-medium text-right">Referrer pts</th>
                <th className="pb-3 font-medium text-right">Referee pts</th>
                <th className="pb-3 font-medium">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {isLoading ? (
                Array(6).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(6).fill(0).map((_, j) => (
                      <td key={j} className="py-3"><div className="h-4 bg-dark-surface2 rounded animate-pulse w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : (data?.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[#636366]">
                    {debouncedSearch ? 'No referrals match this search.' : 'No referrals yet. Share the referral code from any member detail page to start.'}
                  </td>
                </tr>
              ) : (
                (data.data as any[]).map((r) => (
                  <tr key={r.id} className="hover:bg-dark-surface2 transition-colors">
                    <td className="py-3">
                      {r.referrer ? (
                        <Link to={`/members/${r.referrer.id}`} className="hover:text-primary-300">
                          <div className="text-white text-sm">{r.referrer.user?.name || '—'}</div>
                          <div className="text-[11px] text-[#636366]">#{r.referrer.member_number}</div>
                        </Link>
                      ) : <span className="text-[#636366]">—</span>}
                    </td>
                    <td className="py-3">
                      {r.referee ? (
                        <Link to={`/members/${r.referee.id}`} className="hover:text-primary-300">
                          <div className="text-white text-sm">{r.referee.user?.name || '—'}</div>
                          <div className="text-[11px] text-[#636366]">#{r.referee.member_number}</div>
                        </Link>
                      ) : <span className="text-[#636366]">—</span>}
                    </td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusClass(r.status)}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-3 text-right text-white font-semibold">{(r.referrer_points_awarded ?? 0).toLocaleString()}</td>
                    <td className="py-3 text-right text-white font-semibold">{(r.referee_points_awarded ?? 0).toLocaleString()}</td>
                    <td className="py-3 text-xs text-t-secondary">{r.created_at ? format(new Date(r.created_at), 'MMM d, yyyy') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data?.last_page > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-border">
            <p className="text-sm text-t-secondary">
              Showing {data.from ?? 0}–{data.to ?? 0} of {data.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2"
              >Previous</button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= (data.last_page ?? 1)}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2"
              >Next</button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: string }) {
  return (
    <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2" style={{ color: accent }}>
        {icon}
        <span className="text-[11px] uppercase tracking-wider font-semibold">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
    </div>
  )
}

function statusClass(status: string): string {
  if (status === 'rewarded') return 'bg-[#32d74b]/15 text-[#32d74b]'
  if (status === 'qualified') return 'bg-[#5ac8fa]/15 text-[#5ac8fa]'
  if (status === 'pending') return 'bg-[#f59e0b]/15 text-[#f59e0b]'
  return 'bg-dark-surface3 text-[#636366]'
}
