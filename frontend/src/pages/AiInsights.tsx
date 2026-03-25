import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles, TrendingDown, Gift, RefreshCw, Search } from 'lucide-react'
import { api } from '../lib/api'
import { Card } from '../components/ui/Card'
import { TierBadge } from '../components/ui/TierBadge'
import toast from 'react-hot-toast'

export function AiInsights() {
  const [memberId, setMemberId] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [memberInsights, setMemberInsights] = useState<any>(null)
  const [loadingInsights, setLoadingInsights] = useState(false)

  const { data: overview, refetch: refetchOverview, isFetching: loadingOverview } = useQuery({
    queryKey: ['ai-weekly'],
    queryFn: () => api.get('/v1/admin/dashboard/ai-insights').then(r => r.data),
    enabled: false,
  })

  const { data: membersData } = useQuery({
    queryKey: ['member-search-ai', memberSearch],
    queryFn: () => api.get('/v1/admin/members', { params: { search: memberSearch, per_page: 5 } }).then(r => r.data),
    enabled: memberSearch.length > 2,
  })

  const getMemberInsights = async (id: number) => {
    setLoadingInsights(true)
    setMemberId(String(id))
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
    if (score >= 0.7) return 'text-[#ff375f] bg-[#ff375f]/15'
    if (score >= 0.4) return 'text-[#ffd60a] bg-[#ffd60a]/15'
    return 'text-[#32d74b] bg-[#32d74b]/15'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-primary-500/20 rounded-xl flex items-center justify-center">
          <Sparkles size={20} className="text-primary-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">AI Insights</h1>
          <p className="text-sm text-[#8e8e93]">Powered by GPT-4o</p>
        </div>
      </div>

      {/* Weekly Report */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white">Weekly Performance Report</h3>
          <button
            onClick={() => refetchOverview()}
            disabled={loadingOverview}
            className="flex items-center gap-2 text-sm text-primary-400 hover:text-primary-500 disabled:opacity-50 bg-primary-500/10 px-3 py-1.5 rounded-lg"
          >
            <RefreshCw size={14} className={loadingOverview ? 'animate-spin' : ''} />
            {loadingOverview ? 'Generating...' : 'Generate Report'}
          </button>
        </div>
        {overview?.insight ? (
          <div className="bg-primary-500/10 rounded-xl p-4 text-sm text-[#a0a0a0] leading-relaxed whitespace-pre-wrap">
            {overview.insight}
          </div>
        ) : (
          <div className="text-center py-8 text-[#636366]">
            <Sparkles size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Click "Generate Report" to get AI-powered weekly analysis</p>
          </div>
        )}
      </Card>

      {/* Member AI Analysis */}
      <Card>
        <h3 className="font-semibold text-white mb-4">Member AI Analysis</h3>

        <div className="relative mb-4">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
          <input
            type="text"
            placeholder="Search member by name or email..."
            value={memberSearch}
            onChange={(e) => setMemberSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Member Results */}
        {(membersData?.data ?? []).length > 0 && (
          <div className="border border-dark-border rounded-xl divide-y divide-dark-border mb-4">
            {membersData.data.map((m: any) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{m.user?.name}</p>
                  <p className="text-xs text-[#636366]">{m.member_number} · {m.current_points?.toLocaleString()} pts</p>
                </div>
                <div className="flex items-center gap-2">
                  <TierBadge tier={m.tier?.name} color={m.tier?.color_hex} />
                  <button
                    onClick={() => getMemberInsights(m.id)}
                    disabled={loadingInsights}
                    className="text-xs bg-primary-600 text-white px-3 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                  >
                    {loadingInsights && memberId === String(m.id) ? '...' : 'Analyze'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Insights Results */}
        {memberInsights && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Churn Risk */}
            <div className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingDown size={16} className="text-[#ff375f]" />
                <h4 className="font-medium text-[#e0e0e0] text-sm">Churn Risk</h4>
              </div>
              <div className={`text-center py-3 rounded-lg ${churnColor(memberInsights.churn_risk)}`}>
                <p className="text-3xl font-bold">{Math.round(memberInsights.churn_risk * 100)}%</p>
                <p className="text-xs mt-1">
                  {memberInsights.churn_risk >= 0.7 ? 'High Risk' : memberInsights.churn_risk >= 0.4 ? 'Medium Risk' : 'Low Risk'}
                </p>
              </div>
            </div>

            {/* Personalized Offer */}
            <div className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Gift size={16} className="text-[#32d74b]" />
                <h4 className="font-medium text-[#e0e0e0] text-sm">Suggested Offer</h4>
              </div>
              {memberInsights.personalized_offer ? (
                <div>
                  <p className="font-semibold text-white text-sm">{memberInsights.personalized_offer.title}</p>
                  <p className="text-xs text-[#8e8e93] mt-1">{memberInsights.personalized_offer.description}</p>
                  <span className="text-xs bg-[#32d74b]/15 text-[#32d74b] px-2 py-0.5 rounded-full mt-2 inline-block">
                    {memberInsights.personalized_offer.type}: {memberInsights.personalized_offer.value}
                  </span>
                </div>
              ) : <p className="text-xs text-[#636366]">No suggestion</p>}
            </div>

            {/* Upsell Script */}
            <div className="border border-dark-border rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-primary-400" />
                <h4 className="font-medium text-[#e0e0e0] text-sm">Upsell Script</h4>
              </div>
              <p className="text-sm text-[#a0a0a0] italic leading-relaxed">"{memberInsights.upsell_suggestion}"</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
