import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Sparkles, TrendingDown, Gift, RefreshCw, Search,
  Brain, Target, MessageSquareQuote, Users, Award,
  Zap,
} from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import { TierBadge } from '../components/ui/TierBadge'
import toast from 'react-hot-toast'

export function AiInsights() {
  const [memberSearch, setMemberSearch] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null)
  const [memberInsights, setMemberInsights] = useState<any>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)

  const { data: overview, refetch: refetchOverview, isFetching: loadingOverview } = useQuery({
    queryKey: ['ai-weekly'],
    queryFn: () => api.get('/v1/admin/dashboard/ai-insights').then(r => r.data),
    enabled: false,
  })

  const { data: membersData } = useQuery({
    queryKey: ['member-search-ai', memberSearch],
    queryFn: () => api.get('/v1/admin/members', { params: { search: memberSearch, per_page: 6 } }).then(r => r.data),
    enabled: memberSearch.length > 2,
  })

  const { data: tierStats } = useQuery({
    queryKey: ['tier-stats-ai'],
    queryFn: async () => {
      const res = await api.get('/v1/admin/members', { params: { per_page: 1 } })
      const total = res.data.meta?.total ?? 0
      const tiers = await api.get('/v1/admin/tiers')
      return { total, tiers: tiers.data ?? [] }
    },
    staleTime: 5 * 60 * 1000,
  })

  const getMemberInsights = async (id: number) => {
    setLoadingInsights(true)
    setSelectedMemberId(id)
    try {
      const { data } = await api.get(`/v1/admin/members/${id}/ai-insights`)
      setMemberInsights(data)
    } catch {
      toast.error('Failed to generate insights')
    } finally {
      setLoadingInsights(false)
    }
  }

  const churnColor = (score: number) => {
    if (score >= 0.7) return 'text-red-400 bg-red-500/15 border-red-500/20'
    if (score >= 0.4) return 'text-amber-400 bg-amber-500/15 border-amber-500/20'
    return 'text-green-400 bg-green-500/15 border-green-500/20'
  }

  const churnLabel = (score: number) => {
    if (score >= 0.7) return 'High Risk'
    if (score >= 0.4) return 'Medium Risk'
    return 'Low Risk'
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-gradient-to-br from-primary-500/20 to-primary-700/10 rounded-xl flex items-center justify-center border border-primary-500/20">
            <Brain size={22} className="text-primary-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">AI Insights</h1>
            <p className="text-sm text-[#8e8e93] flex items-center gap-1.5">
              Powered by
              <span className="text-[10px] font-semibold bg-green-500/10 text-green-400 px-1.5 py-0.5 rounded-full border border-green-500/20">GPT-4o</span>
              <span className="text-[#636366]">+</span>
              <span className="text-[10px] font-semibold bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-full border border-blue-500/20">Claude</span>
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats Row */}
      {tierStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={14} className="text-primary-400" />
              <span className="text-xs text-[#8e8e93]">Total Members</span>
            </div>
            <div className="text-2xl font-bold text-white">{tierStats.total?.toLocaleString()}</div>
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Award size={14} className="text-amber-400" />
              <span className="text-xs text-[#8e8e93]">Tier Levels</span>
            </div>
            <div className="text-2xl font-bold text-white">{tierStats.tiers?.length ?? 0}</div>
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-green-400" />
              <span className="text-xs text-[#8e8e93]">AI Models</span>
            </div>
            <div className="text-lg font-bold text-white mt-0.5">GPT-4o + Claude</div>
          </div>
          <div className="bg-dark-surface border border-dark-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Target size={14} className="text-purple-400" />
              <span className="text-xs text-[#8e8e93]">Capabilities</span>
            </div>
            <div className="text-lg font-bold text-white mt-0.5">Churn · Offers · Upsell</div>
          </div>
        </div>
      )}

      {/* Weekly Report */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center">
              <Sparkles size={16} className="text-primary-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">Weekly Performance Report</h3>
              <p className="text-[11px] text-[#636366]">AI-generated analysis of your loyalty program</p>
            </div>
          </div>
          <button
            onClick={() => refetchOverview()}
            disabled={loadingOverview}
            className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-300 disabled:opacity-50 bg-primary-500/10 hover:bg-primary-500/15 px-4 py-2 rounded-xl border border-primary-500/20 transition-colors"
          >
            <RefreshCw size={14} className={loadingOverview ? 'animate-spin' : ''} />
            {loadingOverview ? 'Generating…' : 'Generate Report'}
          </button>
        </div>
        {overview?.insight ? (
          <div className="bg-dark-surface2/50 rounded-xl p-5 text-sm text-[#c8c8c8] leading-relaxed whitespace-pre-wrap border border-dark-border">
            {overview.insight}
          </div>
        ) : (
          <div className="text-center py-10 text-[#636366]">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-dark-surface2 flex items-center justify-center border border-dark-border">
              <Sparkles size={28} className="opacity-30" />
            </div>
            <p className="text-sm font-medium">No report generated yet</p>
            <p className="text-xs text-[#4a4a4a] mt-1">Click "Generate Report" to get AI-powered weekly analysis</p>
          </div>
        )}
      </Card>

      {/* Member AI Analysis */}
      <Card>
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Brain size={16} className="text-purple-400" />
          </div>
          <div>
            <h3 className="font-semibold text-white text-sm">Member AI Analysis</h3>
            <p className="text-[11px] text-[#636366]">Churn prediction, personalized offers, and upsell scripts</p>
          </div>
        </div>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
          <input
            type="text"
            placeholder="Search member by name or email…"
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-dark-surface border border-dark-border rounded-xl text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500/50 focus:border-primary-500"
          />
        </div>

        {/* Member Results */}
        {(membersData?.data ?? []).length > 0 && (
          <div className="border border-dark-border rounded-xl divide-y divide-dark-border mb-5 overflow-hidden">
            {membersData.data.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3 hover:bg-dark-surface2/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-500/10 flex items-center justify-center text-xs font-bold text-primary-400">
                    {(m.user?.name ?? '?').charAt(0)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">{m.user?.name}</p>
                    <p className="text-xs text-[#636366]">{m.member_number} · {m.current_points?.toLocaleString()} pts</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TierBadge tier={m.tier?.name} color={m.tier?.color_hex} />
                  <button
                    onClick={() => getMemberInsights(m.id)}
                    disabled={loadingInsights}
                    className="flex items-center gap-1.5 text-xs bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {loadingInsights && selectedMemberId === m.id ? (
                      <><RefreshCw size={11} className="animate-spin" /> Analyzing…</>
                    ) : (
                      <><Brain size={11} /> Analyze</>
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Insights Results */}
        {memberInsights && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Churn Risk */}
              <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown size={16} className="text-red-400" />
                  <h4 className="font-semibold text-white text-sm">Churn Risk</h4>
                </div>
                <div className={`text-center py-4 rounded-xl border ${churnColor(memberInsights.churn_risk)}`}>
                  <p className="text-4xl font-bold">{Math.round(memberInsights.churn_risk * 100)}%</p>
                  <p className="text-xs mt-1 font-medium">{churnLabel(memberInsights.churn_risk)}</p>
                </div>
                <div className="mt-3 h-2 bg-dark-surface2 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      memberInsights.churn_risk >= 0.7 ? 'bg-red-500' :
                      memberInsights.churn_risk >= 0.4 ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.round(memberInsights.churn_risk * 100)}%` }}
                  />
                </div>
              </div>

              {/* Personalized Offer */}
              <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Gift size={16} className="text-green-400" />
                  <h4 className="font-semibold text-white text-sm">Suggested Offer</h4>
                </div>
                {memberInsights.personalized_offer ? (
                  <div className="space-y-2">
                    <p className="font-semibold text-white text-sm">{memberInsights.personalized_offer.title}</p>
                    <p className="text-xs text-[#a0a0a0] leading-relaxed">{memberInsights.personalized_offer.description}</p>
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[10px] bg-green-500/10 text-green-400 px-2 py-0.5 rounded-full border border-green-500/20 font-medium">
                        {memberInsights.personalized_offer.type}
                      </span>
                      {memberInsights.personalized_offer.value && (
                        <span className="text-[10px] bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded-full border border-primary-500/20 font-medium">
                          Value: {memberInsights.personalized_offer.value}
                        </span>
                      )}
                    </div>
                  </div>
                ) : <p className="text-xs text-[#636366]">No suggestion available</p>}
              </div>

              {/* Upsell Script */}
              <div className="bg-dark-surface border border-dark-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MessageSquareQuote size={16} className="text-primary-400" />
                  <h4 className="font-semibold text-white text-sm">Upsell Script</h4>
                </div>
                <div className="bg-dark-surface2/50 border border-dark-border rounded-lg p-3">
                  <p className="text-sm text-[#c8c8c8] italic leading-relaxed">"{memberInsights.upsell_suggestion}"</p>
                </div>
                <p className="text-[10px] text-[#4a4a4a] mt-2">Ready-to-use script for front desk staff</p>
              </div>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
