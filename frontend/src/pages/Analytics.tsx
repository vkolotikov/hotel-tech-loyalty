import { useState, lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// The deep chatbot analytics view used to live as a tab inside
// /chatbot-setup. Moved here so all analytics live under one roof.
const ChatbotAnalytics = lazy(() => import('./ChatbotAnalytics').then(m => ({ default: m.ChatbotAnalytics })))
import toast from 'react-hot-toast'
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Line, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis
} from 'recharts'
import { api } from '../lib/api'
import { triggerExport } from '../lib/crmSettings'
import { Card } from '../components/ui/Card'
import { DesktopOnlyBanner } from '../components/DesktopOnlyBanner'
import { Link } from 'react-router-dom'
import {
  Users, Award, TrendingUp, DollarSign, Download, Activity,
  ArrowUpRight, ArrowDownRight, Clock, Target, PieChart as PieIcon,
  BarChart3, Zap, Hotel, AlertTriangle, Briefcase, MapPin, Globe, UserCheck,
  TrendingDown, MoveRight, ChevronRight, Mail, MessageCircle, Package,
  Sparkles, Bot, Wifi, CreditCard, Settings2, PlayCircle, PackageCheck, CheckCircle2,
} from 'lucide-react'

const TIER_COLORS = ['#CD7F32', '#C0C0C0', '#FFD700', '#6B6B6B', '#00BCD4']
const CHART_TOOLTIP = { backgroundColor: '#1a1a2e', border: '1px solid #2e2e50', borderRadius: 10, color: '#fff' }
const CHART_LABEL = { color: '#8e8e93' }
const PIE_COLORS = ['#3b82f6', '#f59e0b', '#8b5cf6', '#ec4899', '#32d74b', '#636366', '#06b6d4', '#ef4444']

const POINTS_RANGES = [
  { labelKey: 'days_7', days: 7 },
  { labelKey: 'days_30', days: 30 },
  { labelKey: 'days_90', days: 90 },
  { labelKey: 'days_180', days: 180 },
  { labelKey: 'year_1', days: 365 },
] as const

const BOOKING_RANGES = [
  { labelKey: 'd7', days: 7 },
  { labelKey: 'd14', days: 14 },
  { labelKey: 'd30', days: 30 },
  { labelKey: 'd90', days: 90 },
] as const

const GROWTH_RANGES = [
  { labelKey: 'm6', months: 6 },
  { labelKey: 'm12', months: 12 },
  { labelKey: 'm24', months: 24 },
] as const

const CRM_PERIOD_OPTIONS = [
  { labelKey: 'weeks_2', value: 'days14' },
  { labelKey: 'weeks_6', value: 'weeks6' },
  { labelKey: 'months_6', value: 'months6' },
  { labelKey: 'months_12', value: 'months12' },
] as const

type ActiveTab = 'overview' | 'chat' | 'leads' | 'deals' | 'points' | 'members' | 'bookings' | 'pipeline' | 'venues'

export function Analytics() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview')
  const [pointsDays, setPointsDays] = useState(30)
  const [bookingDays, setBookingDays] = useState(30)
  const [growthMonths, setGrowthMonths] = useState(12)
  const [crmPeriod, setCrmPeriod] = useState('months6')
  const [atRiskDays, setAtRiskDays] = useState(60)
  const [cohortMonths, setCohortMonths] = useState(6)
  const [tierMoveDays, setTierMoveDays] = useState(90)

  // Loyalty queries
  const { data: overview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: () => api.get('/v1/admin/analytics/overview').then(r => r.data),
  })

  const { data: pointsData } = useQuery({
    queryKey: ['analytics-points', pointsDays],
    queryFn: () => api.get(`/v1/admin/analytics/points?days=${pointsDays}`).then(r => r.data),
  })

  const { data: cohortRetention } = useQuery({
    queryKey: ['analytics-cohort-retention', cohortMonths],
    queryFn: () => api.get(`/v1/admin/analytics/cohort-retention?months=${cohortMonths}`).then(r => r.data),
    enabled: activeTab === 'members',
  })

  const { data: atRiskMembers } = useQuery({
    queryKey: ['analytics-at-risk', atRiskDays],
    queryFn: () => api.get(`/v1/admin/analytics/at-risk-members?days=${atRiskDays}&limit=25`).then(r => r.data),
    enabled: activeTab === 'members',
  })

  const { data: tierMovement } = useQuery({
    queryKey: ['analytics-tier-movement', tierMoveDays],
    queryFn: () => api.get(`/v1/admin/analytics/tier-movement?days=${tierMoveDays}`).then(r => r.data),
    enabled: activeTab === 'members',
  })

  const { data: memberGrowth } = useQuery({
    queryKey: ['analytics-member-growth', growthMonths],
    queryFn: () => api.get(`/v1/admin/analytics/member-growth?months=${growthMonths}`).then(r => r.data),
  })

  const { data: revenue } = useQuery({
    queryKey: ['analytics-revenue'],
    queryFn: () => api.get('/v1/admin/analytics/revenue').then(r => r.data),
  })

  const { data: revenueTrend } = useQuery({
    queryKey: ['analytics-revenue-trend'],
    queryFn: () => api.get('/v1/admin/analytics/revenue-trend?months=12').then(r => r.data),
  })

  const { data: bookingTrends } = useQuery({
    queryKey: ['analytics-booking-trends', bookingDays],
    queryFn: () => api.get(`/v1/admin/analytics/booking-trends?days=${bookingDays}`).then(r => r.data),
  })

  const { data: engagement } = useQuery({
    queryKey: ['analytics-engagement'],
    queryFn: () => api.get('/v1/admin/analytics/engagement').then(r => r.data),
  })

  const { data: pointsDist } = useQuery({
    queryKey: ['analytics-points-distribution'],
    queryFn: () => api.get('/v1/admin/analytics/points-distribution').then(r => r.data),
  })

  const { data: redemptionTrend } = useQuery({
    queryKey: ['analytics-redemption-trend'],
    queryFn: () => api.get('/v1/admin/analytics/redemption-trend?months=12').then(r => r.data),
  })

  const { data: bookingMetrics } = useQuery({
    queryKey: ['analytics-booking-metrics'],
    queryFn: () => api.get('/v1/admin/analytics/booking-metrics?months=12').then(r => r.data),
  })

  // Hotel ops KPIs (occupancy, ADR, RevPAR) — the standard hospitality
  // revenue-management triad. Computed off PMS booking_mirror, prorated
  // for stays that straddle the window.
  const { data: hotelOps } = useQuery<any>({
    queryKey: ['analytics-hotel-ops', bookingDays],
    queryFn: () => api.get(`/v1/admin/analytics/hotel-ops?days=${bookingDays}`).then(r => r.data),
  })

  // Conversion funnel — stage-by-stage rollup with conversion rates
  // and time-to-close. Cheap to render so we leave it always-fetched.
  const { data: inquiryFunnel } = useQuery<any>({
    queryKey: ['analytics-inquiry-funnel'],
    queryFn: () => api.get('/v1/admin/analytics/inquiry-funnel?months=6').then(r => r.data),
    enabled: activeTab === 'pipeline',
  })

  const { data: expiryForecast } = useQuery({
    queryKey: ['analytics-expiry-forecast'],
    queryFn: () => api.get('/v1/admin/analytics/expiry-forecast?months=6').then(r => r.data),
  })

  // CRM queries
  const { data: crmTrends } = useQuery({
    queryKey: ['analytics-crm-trends', crmPeriod],
    queryFn: () => api.get(`/v1/admin/analytics/crm-trends?period=${crmPeriod}`).then(r => r.data),
    enabled: activeTab === 'pipeline' || activeTab === 'overview',
  })

  const { data: inquiryPipeline } = useQuery({
    queryKey: ['analytics-inquiry-pipeline'],
    queryFn: () => api.get('/v1/admin/analytics/inquiry-pipeline').then(r => r.data),
    enabled: activeTab === 'pipeline' || activeTab === 'overview',
  })

  const { data: bookingChannels } = useQuery({
    queryKey: ['analytics-booking-channels'],
    queryFn: () => api.get('/v1/admin/analytics/booking-channels').then(r => r.data),
    enabled: activeTab === 'pipeline',
  })

  const { data: revenueComparison } = useQuery({
    queryKey: ['analytics-revenue-comparison'],
    queryFn: () => api.get('/v1/admin/analytics/revenue-comparison').then(r => r.data),
    enabled: activeTab === 'pipeline',
  })

  const { data: occupancy } = useQuery({
    queryKey: ['analytics-occupancy', crmPeriod],
    queryFn: () => api.get(`/v1/admin/analytics/occupancy?period=${crmPeriod}`).then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: vipDist } = useQuery({
    queryKey: ['analytics-vip-dist'],
    queryFn: () => api.get('/v1/admin/analytics/vip-distribution').then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: nationality } = useQuery({
    queryKey: ['analytics-nationality'],
    queryFn: () => api.get('/v1/admin/analytics/nationality').then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: venueUtil } = useQuery({
    queryKey: ['analytics-venue-util'],
    queryFn: () => api.get('/v1/admin/analytics/venue-utilization').then(r => r.data),
    enabled: activeTab === 'venues',
  })

  const { data: revByProperty } = useQuery({
    queryKey: ['analytics-rev-by-property'],
    queryFn: () => api.get('/v1/admin/analytics/revenue-by-property').then(r => r.data),
    enabled: activeTab === 'venues' || activeTab === 'pipeline',
  })

  const qc = useQueryClient()

  // Per-user opt-in for the daily loyalty digest email (mirrors the
  // engagement-digest pattern but lives on its own pref so admins
  // can opt in/out independently).
  const { data: prefs } = useQuery<{ wants_loyalty_digest: boolean }>({
    queryKey: ['me', 'preferences'],
    queryFn: () => api.get('/v1/admin/me/preferences').then(r => r.data),
    staleTime: 60_000,
  })
  const setLoyaltyDigest = useMutation({
    mutationFn: (enabled: boolean) => api.put('/v1/admin/me/preferences', { wants_loyalty_digest: enabled }),
    onSuccess: (_d, enabled) => {
      qc.invalidateQueries({ queryKey: ['me', 'preferences'] })
      toast.success(enabled ? t('analytics.digest_toast_on', 'Loyalty digest turned on') : t('analytics.digest_toast_off', 'Loyalty digest turned off'))
    },
    onError: () => toast.error(t('analytics.digest_toast_error', 'Failed to update preference')),
  })

  const kpis = overview?.kpis
  const tierDist = overview?.tier_distribution ?? []

  const tabs: { id: ActiveTab; label: string; icon: any }[] = [
    { id: 'overview', label: t('analytics.tabs.overview', 'Overview'), icon: <BarChart3 size={15} /> },
    { id: 'chat',     label: t('analytics.tabs.chat', 'Chat'),         icon: <MessageCircle size={15} /> },
    { id: 'leads',    label: t('analytics.tabs.leads', 'Leads'),       icon: <Briefcase size={15} /> },
    { id: 'deals',    label: t('analytics.tabs.deals', 'Deals'),       icon: <Package size={15} /> },
    { id: 'points', label: t('analytics.tabs.points', 'Points & Rewards'), icon: <Award size={15} /> },
    { id: 'members', label: t('analytics.tabs.members', 'Members'), icon: <Users size={15} /> },
    { id: 'bookings', label: t('analytics.tabs.bookings', 'Bookings & Revenue'), icon: <Hotel size={15} /> },
    { id: 'pipeline', label: t('analytics.tabs.pipeline', 'CRM Pipeline'), icon: <Briefcase size={15} /> },
    { id: 'venues', label: t('analytics.tabs.venues', 'Venues & Guests'), icon: <MapPin size={15} /> },
  ]

  // Lazy-fetch the data behind each operational page's stats so the
  // analytics tab can render them without each operational page also
  // showing the same numbers. enabled: keeps these queries idle until
  // the user opens the relevant tab.
  const { data: chatKpis } = useQuery<any>({
    queryKey: ['analytics-chat-kpis'],
    queryFn: () => api.get('/v1/admin/engagement/kpis').then(r => r.data),
    enabled: activeTab === 'chat',
  })
  const { data: leadsKpis } = useQuery<any>({
    queryKey: ['analytics-leads-kpis'],
    queryFn: () => api.get('/v1/admin/inquiries/kpis').then(r => r.data),
    enabled: activeTab === 'leads',
  })
  const { data: dealsKpis } = useQuery<any>({
    queryKey: ['analytics-deals-kpis'],
    queryFn: () => api.get('/v1/admin/deals/kpis').then(r => r.data),
    enabled: activeTab === 'deals',
  })

  return (
    <div className="space-y-6">
      <DesktopOnlyBanner pageKey="analytics" message="Analytics charts and dense tables are best viewed on a desktop or tablet. On mobile, charts may require horizontal scrolling." />
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('analytics.title', 'Analytics')}</h1>
          <p className="text-sm text-t-secondary mt-1">{t('analytics.subtitle', 'Deep dive into loyalty & CRM performance')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLoyaltyDigest.mutate(!prefs?.wants_loyalty_digest)}
            disabled={setLoyaltyDigest.isPending}
            title={prefs?.wants_loyalty_digest
              ? t('analytics.digest_on_title', 'Daily loyalty digest is on. Click to turn off.')
              : t('analytics.digest_off_title', 'Get a morning email at 8am local time with yesterday\'s loyalty numbers + at-risk members. Click to enable.')}
            className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-xs transition-colors ${
              prefs?.wants_loyalty_digest
                ? 'bg-blue-500/10 border border-blue-500/40 text-blue-400'
                : 'bg-dark-surface border border-dark-border text-t-secondary hover:text-white'
            }`}
          >
            <Mail size={13} />
            {prefs?.wants_loyalty_digest ? t('analytics.digest_on', 'Daily digest on') : t('analytics.digest_off', 'Daily digest')}
          </button>
          <button
            onClick={() => triggerExport('/v1/admin/analytics/export')}
            className="flex items-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
          >
            <Download size={15} /> {t('analytics.export_report', 'Export Report')}
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 bg-dark-surface rounded-xl p-1 border border-dark-border overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all flex-1 justify-center whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                : 'text-t-secondary hover:text-white hover:bg-dark-surface2'
            }`}
          >
            {tab.icon}
            <span className="hidden md:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ════════════════ OVERVIEW TAB ════════════════ */}
      {activeTab === 'overview' && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { key: 'total_members', label: t('analytics.kpis.total_members', 'Total Members'), value: kpis?.total_members?.toLocaleString() ?? '—', icon: <Users size={18} />, color: 'text-blue-400', bg: 'bg-blue-500/15' },
              { key: 'avg_points', label: t('analytics.kpis.avg_points_per_member', 'Avg Points / Member'), value: kpis?.avg_points_per_member?.toLocaleString() ?? '—', icon: <Award size={18} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
              { key: 'active_stays', label: t('analytics.kpis.active_stays', 'Active Stays'), value: kpis?.active_stays ?? '—', icon: <TrendingUp size={18} />, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
              { key: 'revenue_month', label: t('analytics.kpis.revenue_month', 'Revenue (Month)'), value: kpis ? `$${Number(kpis.revenue_this_month).toLocaleString()}` : '—', icon: <DollarSign size={18} />, color: 'text-purple-400', bg: 'bg-purple-500/15' },
            ].map(m => (
              <div key={m.key} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          {/* Points Activity */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-base font-semibold text-white">{t('analytics.cards.points_activity', 'Points Activity')}</h3>
                <p className="text-xs text-[#636366] mt-0.5">{t('analytics.cards.points_activity_sub', 'Points earned vs redeemed over time')}</p>
              </div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {POINTS_RANGES.map(r => (
                  <button key={r.days} onClick={() => setPointsDays(r.days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${pointsDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.ranges.${r.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pointsData ?? []}>
                <defs>
                  <linearGradient id="gEarned" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c9a84c" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#c9a84c" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRedeemed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#32d74b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5) ?? v} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => Number(v).toLocaleString()} />
                <Legend />
                <Area type="monotone" dataKey="earned" stroke="#c9a84c" strokeWidth={2} fill="url(#gEarned)" name={t('analytics.series.earned', 'Earned')} />
                <Area type="monotone" dataKey="redeemed" stroke="#32d74b" strokeWidth={2} fill="url(#gRedeemed)" name={t('analytics.series.redeemed', 'Redeemed')} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Tier + Revenue by Room Type */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <PieIcon size={16} className="text-primary-400" /> {t('analytics.cards.tier_distribution', 'Tier Distribution')}
              </h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={tierDist} dataKey="count" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                      {tierDist.map((_: any, i: number) => <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {tierDist.map((tier: any, i: number) => {
                    const total = tierDist.reduce((s: number, x: any) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((tier.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium text-[#e0e0e0]">{tier.tier}</span>
                            <span className="text-xs text-t-secondary">{tier.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-dark-surface3 rounded-full">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2">
                <Hotel size={16} className="text-purple-400" /> {t('analytics.cards.revenue_by_room_type', 'Revenue by Room Type')}
              </h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={revenue ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="room_type" type="category" tick={{ fontSize: 11, fill: '#8e8e93' }} width={85} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name={t('analytics.series.revenue', 'Revenue')} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Member Growth */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Activity size={16} className="text-amber-400" /> {t('analytics.cards.member_growth', 'Member Growth')}
              </h3>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {GROWTH_RANGES.map(r => (
                  <button key={r.months} onClick={() => setGrowthMonths(r.months)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${growthMonths === r.months ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.ranges.${r.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={memberGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Legend />
                <Bar dataKey="new_members" fill="#c9a84c" radius={[4, 4, 0, 0]} name={t('analytics.series.new_members', 'New Members')} opacity={0.8} />
                <Line type="monotone" dataKey="new_members" stroke="#9a7a30" strokeWidth={2} dot={false} name={t('analytics.series.trend', 'Trend')} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* Top Members Table */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-4">{t('analytics.cards.top_members', 'Top Members by Lifetime Points')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-t-secondary text-xs uppercase tracking-wide border-b border-dark-border">
                    <th className="pb-3 font-semibold">{t('analytics.table.rank', '#')}</th>
                    <th className="pb-3 font-semibold">{t('analytics.table.member', 'Member')}</th>
                    <th className="pb-3 font-semibold">{t('analytics.table.tier', 'Tier')}</th>
                    <th className="pb-3 font-semibold text-right">{t('analytics.table.lifetime_points', 'Lifetime Points')}</th>
                    <th className="pb-3 font-semibold text-right">{t('analytics.table.current_balance', 'Current Balance')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {(overview?.top_members ?? []).map((m: any, i: number) => (
                    <tr key={i} className="hover:bg-dark-surface2 transition-colors">
                      <td className="py-3 text-[#636366] font-bold">{i + 1}</td>
                      <td className="py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-400">{m.name?.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-white">{m.name}</p>
                            <p className="text-xs text-[#636366]">{m.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3">
                        <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-dark-surface3 text-[#a0a0a0]">{m.tier}</span>
                      </td>
                      <td className="py-3 font-bold text-white text-right">{m.lifetime_points?.toLocaleString()}</td>
                      <td className="py-3 text-[#a0a0a0] text-right">{m.current_points?.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════ POINTS TAB ════════════════ */}
      {activeTab === 'points' && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { key: 'issued', label: t('analytics.kpis.issued_this_month', 'Issued This Month'), value: kpis?.points_issued_this_month?.toLocaleString() ?? '—', icon: <ArrowUpRight size={18} />, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
              { key: 'redeemed', label: t('analytics.kpis.redeemed_this_month', 'Redeemed This Month'), value: kpis?.points_redeemed_this_month?.toLocaleString() ?? '—', icon: <ArrowDownRight size={18} />, color: 'text-[#ff375f]', bg: 'bg-[#ff375f]/15' },
              { key: 'outstanding', label: t('analytics.kpis.outstanding_points', 'Outstanding Points'), value: kpis?.total_outstanding_points?.toLocaleString() ?? '—', icon: <Target size={18} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
              { key: 'rate', label: t('analytics.kpis.redemption_rate', 'Redemption Rate'), value: `${kpis?.redemption_rate ?? 0}%`, icon: <Zap size={18} />, color: 'text-purple-400', bg: 'bg-purple-500/15' },
            ].map(m => (
              <div key={m.key} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">{t('analytics.cards.points_flow', 'Points Flow')}</h3><p className="text-xs text-[#636366] mt-0.5">{t('analytics.cards.points_flow_sub', 'Earned vs redeemed over time')}</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {POINTS_RANGES.map(r => (
                  <button key={r.days} onClick={() => setPointsDays(r.days)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${pointsDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.ranges.${r.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={pointsData ?? []}>
                <defs>
                  <linearGradient id="gEarned2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#c9a84c" stopOpacity={0.25} /><stop offset="95%" stopColor="#c9a84c" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gRedeemed2" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} /><stop offset="95%" stopColor="#32d74b" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5) ?? v} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => Number(v).toLocaleString()} />
                <Legend />
                <Area type="monotone" dataKey="earned" stroke="#c9a84c" strokeWidth={2} fill="url(#gEarned2)" name={t('analytics.series.earned', 'Earned')} />
                <Area type="monotone" dataKey="redeemed" stroke="#32d74b" strokeWidth={2} fill="url(#gRedeemed2)" name={t('analytics.series.redeemed', 'Redeemed')} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Zap size={16} className="text-purple-400" /> {t('analytics.cards.redemption_trend', 'Redemption Rate Trend')}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <ComposedChart data={redemptionTrend ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="earned" fill="#c9a84c" opacity={0.6} radius={[3, 3, 0, 0]} name={t('analytics.series.earned', 'Earned')} />
                  <Bar yAxisId="left" dataKey="redeemed" fill="#32d74b" opacity={0.6} radius={[3, 3, 0, 0]} name={t('analytics.series.redeemed', 'Redeemed')} />
                  <Line yAxisId="right" type="monotone" dataKey="rate" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6' }} name={t('analytics.series.rate_pct', 'Rate %')} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Target size={16} className="text-amber-400" /> {t('analytics.cards.points_balance_distribution', 'Points Balance Distribution')}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={pointsDist ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Bar dataKey="members" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('analytics.series.members', 'Members')} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card>
            <h3 className="text-base font-semibold text-white mb-2 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" /> {t('analytics.cards.points_expiry_forecast', 'Points Expiry Forecast')}</h3>
            <p className="text-xs text-[#636366] mb-5">{t('analytics.cards.points_expiry_sub', 'Points scheduled to expire in upcoming months')}</p>
            {(expiryForecast ?? []).length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={expiryForecast ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [Number(v).toLocaleString(), name === 'points' ? t('analytics.series.points', 'Points') : name]} />
                  <Bar dataKey="points" fill="#f59e0b" radius={[4, 4, 0, 0]} name={t('analytics.series.expiring_points', 'Expiring Points')} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-[#636366] text-sm py-8 text-center">{t('analytics.cards.no_expiry_data', 'No points expiry data available')}</p>
            )}
          </Card>

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">{t('analytics.kpis.outstanding_points', 'Outstanding Points')}</p>
              <p className="text-2xl font-bold text-amber-400">{(kpis?.total_outstanding_points ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">{t('analytics.kpis.estimated_liability', 'Estimated Liability')}</p>
              <p className="text-2xl font-bold text-purple-400">${(kpis?.point_liability_currency ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">{t('analytics.kpis.avg_points_per_member', 'Avg Points / Member')}</p>
              <p className="text-2xl font-bold text-blue-400">{(kpis?.avg_points_per_member ?? 0).toLocaleString()}</p>
            </div>
            <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
              <p className="text-xs text-t-secondary mb-1">{t('analytics.kpis.engaged_members_30d', 'Engaged Members (30d)')}</p>
              <p className="text-2xl font-bold text-[#32d74b]">{(kpis?.engaged_members_30d ?? 0).toLocaleString()}</p>
            </div>
          </div>
        </>
      )}

      {/* ════════════════ MEMBERS TAB ════════════════ */}
      {activeTab === 'members' && (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { key: 'total', label: t('analytics.kpis.total_members', 'Total Members'), value: kpis?.total_members?.toLocaleString() ?? '—', color: 'text-blue-400', bg: 'bg-blue-500/15', icon: <Users size={18} /> },
              { key: 'active', label: t('analytics.kpis.active_members', 'Active Members'), value: kpis?.active_members?.toLocaleString() ?? '—', color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15', icon: <Activity size={18} /> },
              { key: 'new', label: t('analytics.kpis.new_this_month', 'New This Month'), value: kpis?.new_members_this_month?.toLocaleString() ?? '—', color: 'text-primary-400', bg: 'bg-primary-500/15', icon: <ArrowUpRight size={18} /> },
              { key: 'engaged', label: t('analytics.kpis.engaged_30d', 'Engaged (30d)'), value: kpis?.engaged_members_30d?.toLocaleString() ?? '—', color: 'text-amber-400', bg: 'bg-amber-500/15', icon: <Zap size={18} /> },
            ].map(m => (
              <div key={m.key} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Activity size={16} className="text-[#32d74b]" /> {t('analytics.cards.member_engagement', 'Member Engagement')}</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={engagement ?? []} dataKey="count" nameKey="segment" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(engagement ?? []).map((e: any, i: number) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {(engagement ?? []).map((e: any, i: number) => {
                    const total = (engagement ?? []).reduce((s: number, x: any) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((e.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: e.color }} />
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium text-[#e0e0e0]">{e.segment}</span>
                            <span className="text-xs text-t-secondary">{e.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-dark-surface3 rounded-full">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: e.color }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><PieIcon size={16} className="text-primary-400" /> {t('analytics.cards.tier_distribution', 'Tier Distribution')}</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="55%" height={220}>
                  <PieChart>
                    <Pie data={tierDist} dataKey="count" cx="50%" cy="50%" innerRadius={55} outerRadius={90}>
                      {tierDist.map((_: any, i: number) => <Cell key={i} fill={TIER_COLORS[i % TIER_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {tierDist.map((tier: any, i: number) => {
                    const total = tierDist.reduce((s: number, x: any) => s + x.count, 0)
                    const pct = total > 0 ? Math.round((tier.count / total) * 100) : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                        <div className="flex-1">
                          <div className="flex justify-between mb-0.5">
                            <span className="text-xs font-medium text-[#e0e0e0]">{tier.tier}</span>
                            <span className="text-xs text-t-secondary">{tier.count} ({pct}%)</span>
                          </div>
                          <div className="h-1.5 bg-dark-surface3 rounded-full">
                            <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Card>
          </div>

          <Card>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-semibold text-white flex items-center gap-2"><TrendingUp size={16} className="text-amber-400" /> {t('analytics.cards.member_growth', 'Member Growth')}</h3>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {GROWTH_RANGES.map(r => (
                  <button key={r.months} onClick={() => setGrowthMonths(r.months)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${growthMonths === r.months ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.ranges.${r.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={memberGrowth ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Legend />
                <Bar dataKey="new_members" fill="#c9a84c" radius={[4, 4, 0, 0]} name={t('analytics.series.new_members', 'New Members')} opacity={0.8} />
                <Line type="monotone" dataKey="new_members" stroke="#9a7a30" strokeWidth={2} dot={false} name={t('analytics.series.trend', 'Trend')} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Target size={16} className="text-blue-400" /> {t('analytics.cards.member_points_distribution', 'Member Points Balance Distribution')}</h3>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={pointsDist ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Bar dataKey="members" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('analytics.series.members', 'Members')} />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* ─── Tier movement ─── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <MoveRight size={16} className="text-amber-400" /> {t('analytics.cards.tier_movement', 'Tier movement')}
              </h3>
              <select value={tierMoveDays} onChange={e => setTierMoveDays(Number(e.target.value))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1 text-xs text-white">
                <option value={30}>{t('analytics.tier_windows.30', 'Last 30 days')}</option>
                <option value={90}>{t('analytics.tier_windows.90', 'Last 90 days')}</option>
                <option value={180}>{t('analytics.tier_windows.180', 'Last 6 months')}</option>
                <option value={365}>{t('analytics.tier_windows.365', 'Last year')}</option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-[#1a1a1a] border border-emerald-500/20 rounded-lg p-3 text-center">
                <TrendingUp size={16} className="text-emerald-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-white">{(tierMovement?.upgrades ?? 0).toLocaleString()}</div>
                <div className="text-[11px] text-[#636366]">{t('analytics.cards.tier_upgrades', 'Upgrades')}</div>
              </div>
              <div className="bg-[#1a1a1a] border border-red-500/20 rounded-lg p-3 text-center">
                <TrendingDown size={16} className="text-red-400 mx-auto mb-1" />
                <div className="text-xl font-bold text-white">{(tierMovement?.downgrades ?? 0).toLocaleString()}</div>
                <div className="text-[11px] text-[#636366]">{t('analytics.cards.tier_downgrades', 'Downgrades')}</div>
              </div>
              <div className="bg-[#1a1a1a] border border-dark-border rounded-lg p-3 text-center">
                <MoveRight size={16} className="text-[#a0a0a0] mx-auto mb-1" />
                <div className="text-xl font-bold text-white">{(tierMovement?.lateral ?? 0).toLocaleString()}</div>
                <div className="text-[11px] text-[#636366]">{t('analytics.cards.tier_lateral', 'No change')}</div>
              </div>
            </div>
            {(tierMovement?.flows ?? []).length > 0 ? (
              <div className="space-y-1">
                {(tierMovement?.flows ?? []).slice(0, 8).map((f: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-dark-surface2">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: (f.from_color || '#666') + '22', color: f.from_color || '#a0a0a0' }}>{f.from}</span>
                    <ChevronRight size={14} className={f.direction === 'up' ? 'text-emerald-400' : f.direction === 'down' ? 'text-red-400' : 'text-[#636366]'} />
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: (f.to_color || '#666') + '22', color: f.to_color || '#a0a0a0' }}>{f.to}</span>
                    <span className="ml-auto text-sm text-white font-semibold">{f.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[#636366] text-center py-6">{t('analytics.cards.tier_no_movement', 'No tier movement in this window.')}</p>
            )}
          </Card>

          {/* ─── Cohort retention ─── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Activity size={16} className="text-blue-400" /> {t('analytics.cards.cohort_retention', 'Cohort retention')}
                <span className="text-[11px] text-[#636366] font-normal">{t('analytics.cards.cohort_retention_sub', 'members with a transaction in the month, as % of cohort size')}</span>
              </h3>
              <select value={cohortMonths} onChange={e => setCohortMonths(Number(e.target.value))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1 text-xs text-white">
                <option value={3}>{t('analytics.cohort_options.3', 'Last 3 cohorts')}</option>
                <option value={6}>{t('analytics.cohort_options.6', 'Last 6 cohorts')}</option>
                <option value={12}>{t('analytics.cohort_options.12', 'Last 12 cohorts')}</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-t-secondary border-b border-dark-border">
                    <th className="pb-2 font-medium">{t('analytics.cards.cohort_col_cohort', 'Cohort')}</th>
                    <th className="pb-2 font-medium text-center">{t('analytics.cards.cohort_col_size', 'Size')}</th>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <th key={i} className="pb-2 font-medium text-center text-[11px]">M{i}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(cohortRetention ?? []).length === 0 ? (
                    <tr><td colSpan={8} className="py-8 text-center text-[#636366]">{t('analytics.cards.cohort_empty', 'No cohort data yet — members need at least one join-month + one transaction.')}</td></tr>
                  ) : (cohortRetention as any[]).map((c) => (
                    <tr key={c.cohort} className="border-b border-dark-border last:border-b-0">
                      <td className="py-2 text-white font-mono text-xs">{c.cohort}</td>
                      <td className="py-2 text-center text-[#a0a0a0]">{c.size}</td>
                      {Array.from({ length: 6 }).map((_, i) => {
                        const cell = c.retention?.[i]
                        if (!cell) return <td key={i} className="py-2 text-center text-[#3a3a3a]">—</td>
                        const bg = cell.pct >= 70 ? 'rgba(50,215,75,0.25)' : cell.pct >= 40 ? 'rgba(255,159,10,0.25)' : 'rgba(239,68,68,0.18)'
                        return (
                          <td key={i} className="py-1 text-center">
                            <div className="inline-block min-w-[44px] px-2 py-1 rounded text-xs font-semibold text-white"
                              style={{ backgroundColor: bg }}>{cell.pct}%</div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* ─── At-risk members ─── */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <AlertTriangle size={16} className="text-amber-400" /> {t('analytics.cards.at_risk', 'At-risk members')}
                <span className="text-[11px] text-[#636366] font-normal">{t('analytics.cards.at_risk_sub', 'previously active, gone quiet')}</span>
              </h3>
              <select value={atRiskDays} onChange={e => setAtRiskDays(Number(e.target.value))}
                className="bg-dark-bg border border-dark-border rounded-lg px-2 py-1 text-xs text-white">
                <option value={30}>{t('analytics.at_risk_options.30', 'No activity 30+ days')}</option>
                <option value={60}>{t('analytics.at_risk_options.60', 'No activity 60+ days')}</option>
                <option value={90}>{t('analytics.at_risk_options.90', 'No activity 90+ days')}</option>
                <option value={180}>{t('analytics.at_risk_options.180', 'No activity 180+ days')}</option>
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-t-secondary border-b border-dark-border">
                    <th className="pb-2 font-medium">{t('analytics.table.member', 'Member')}</th>
                    <th className="pb-2 font-medium">{t('analytics.table.tier', 'Tier')}</th>
                    <th className="pb-2 font-medium text-right">{t('analytics.table.lifetime_pts', 'Lifetime pts')}</th>
                    <th className="pb-2 font-medium text-right">{t('analytics.table.current_pts', 'Current pts')}</th>
                    <th className="pb-2 font-medium text-right">{t('analytics.table.days_quiet', 'Days quiet')}</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {(atRiskMembers ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="py-8 text-center text-[#636366]">{t('analytics.cards.at_risk_empty', 'Nobody at risk in this window — engagement looks healthy.')}</td></tr>
                  ) : (atRiskMembers as any[]).map((m) => (
                    <tr key={m.id} className="hover:bg-dark-surface2">
                      <td className="py-2">
                        <div className="text-white text-sm">{m.name}</div>
                        <div className="text-[11px] text-[#636366]">{m.email}</div>
                      </td>
                      <td className="py-2">
                        {m.tier && (
                          <span className="inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold"
                            style={{ backgroundColor: (m.tier_color || '#666') + '22', color: m.tier_color || '#a0a0a0' }}>
                            {m.tier}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right text-white font-semibold">{m.lifetime_points.toLocaleString()}</td>
                      <td className="py-2 text-right text-[#a0a0a0]">{m.current_points.toLocaleString()}</td>
                      <td className="py-2 text-right">
                        <span className={`text-sm font-semibold ${m.days_since_activity >= 180 ? 'text-red-400' : m.days_since_activity >= 90 ? 'text-amber-400' : 'text-[#a0a0a0]'}`}>
                          {m.days_since_activity}
                        </span>
                      </td>
                      <td className="py-2 text-right">
                        <Link to={`/members/${m.id}`} className="text-primary-400 hover:text-primary-300 text-xs font-semibold inline-flex items-center gap-1">
                          {t('analytics.table.open', 'Open')} <ChevronRight size={12} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════ BOOKINGS TAB ════════════════ */}
      {activeTab === 'bookings' && (
        <>
          {/* Hotel ops triad — the standard hospitality revenue-management
              metrics. Pinned at the top of the bookings tab because these
              are what GMs and revenue managers open the dashboard for.
              Reflects the same date range selector as the trend chart below. */}
          {hotelOps && hotelOps.total_rooms > 0 && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className="inline-flex p-2 rounded-lg bg-emerald-500/15 text-emerald-400 mb-3"><Hotel size={18} /></div>
                <p className="text-2xl font-bold text-white tabular-nums">{hotelOps.occupancy_pct}%</p>
                <p className="text-xs text-t-secondary mt-0.5">{t('analytics.kpis.occupancy', 'Occupancy')}</p>
                <p className="text-[10px] text-gray-600 mt-1">{t('analytics.kpis.occupancy_room_nights', { occupied: hotelOps.occupied_room_nights, available: hotelOps.available_room_nights, defaultValue: '{{occupied}} / {{available}} room-nights' })}</p>
              </div>
              <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className="inline-flex p-2 rounded-lg bg-blue-500/15 text-blue-400 mb-3"><DollarSign size={18} /></div>
                <p className="text-2xl font-bold text-white tabular-nums">€{Math.round(hotelOps.adr).toLocaleString()}</p>
                <p className="text-xs text-t-secondary mt-0.5">{t('analytics.kpis.adr', 'ADR')} <span className="text-gray-600 font-normal">{t('analytics.kpis.adr_sub', '— Avg Daily Rate')}</span></p>
                <p className="text-[10px] text-gray-600 mt-1">{t('analytics.kpis.adr_hint', 'Revenue per occupied night')}</p>
              </div>
              <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className="inline-flex p-2 rounded-lg bg-purple-500/15 text-purple-400 mb-3"><Zap size={18} /></div>
                <p className="text-2xl font-bold text-white tabular-nums">€{Math.round(hotelOps.revpar).toLocaleString()}</p>
                <p className="text-xs text-t-secondary mt-0.5">{t('analytics.kpis.revpar', 'RevPAR')} <span className="text-gray-600 font-normal">{t('analytics.kpis.revpar_sub', '— Revenue per Available Room')}</span></p>
                <p className="text-[10px] text-gray-600 mt-1">{t('analytics.kpis.revpar_hint', 'Occupancy × ADR — combined')}</p>
              </div>
              <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className="inline-flex p-2 rounded-lg bg-amber-500/15 text-amber-400 mb-3"><DollarSign size={18} /></div>
                <p className="text-2xl font-bold text-white tabular-nums">€{Math.round(hotelOps.revenue).toLocaleString()}</p>
                <p className="text-xs text-t-secondary mt-0.5">{t('analytics.kpis.window_revenue', 'Window Revenue')}</p>
                <p className="text-[10px] text-gray-600 mt-1">{hotelOps.window_from} → {hotelOps.window_to}</p>
              </div>
            </div>
          )}
          {hotelOps && hotelOps.total_rooms === 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle size={14} className="inline -mt-0.5 mr-2" />
              {t('analytics.hotel_ops_empty', 'Configure your room inventory in Settings → Booking (or sync apartments from Smoobu) to see occupancy, ADR and RevPAR.')}
            </div>
          )}

          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              { key: 'revenue_month', label: t('analytics.kpis.revenue_month', 'Revenue (Month)'), value: kpis ? `$${Number(kpis.revenue_this_month).toLocaleString()}` : '—', icon: <DollarSign size={18} />, color: 'text-[#32d74b]', bg: 'bg-[#32d74b]/15' },
              { key: 'active_stays', label: t('analytics.kpis.active_stays', 'Active Stays'), value: kpis?.active_stays ?? '—', icon: <Hotel size={18} />, color: 'text-blue-400', bg: 'bg-blue-500/15' },
              { key: 'liability', label: t('analytics.kpis.liability', 'Liability'), value: kpis ? `$${Number(kpis.point_liability_currency).toLocaleString()}` : '—', icon: <AlertTriangle size={18} />, color: 'text-amber-400', bg: 'bg-amber-500/15' },
              { key: 'redemption_rate', label: t('analytics.kpis.redemption_rate', 'Redemption Rate'), value: `${kpis?.redemption_rate ?? 0}%`, icon: <Zap size={18} />, color: 'text-purple-400', bg: 'bg-purple-500/15' },
            ].map(m => (
              <div key={m.key} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <div className={`inline-flex p-2 rounded-lg ${m.bg} ${m.color} mb-3`}>{m.icon}</div>
                <p className="text-2xl font-bold text-white">{m.value}</p>
                <p className="text-xs text-t-secondary mt-0.5">{m.label}</p>
              </div>
            ))}
          </div>

          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">{t('analytics.cards.booking_trends', 'Booking Trends')}</h3><p className="text-xs text-[#636366] mt-0.5">{t('analytics.cards.booking_trends_sub', 'Daily bookings and revenue')}</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {BOOKING_RANGES.map(r => (
                  <button key={r.days} onClick={() => setBookingDays(r.days)}
                    className={`px-2.5 py-1.5 rounded-md text-xs font-semibold transition-all ${bookingDays === r.days ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.ranges.${r.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={bookingTrends ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => v?.slice(5) ?? v} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(0) + 'k' : v}`} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any, item: any) => [item?.dataKey === 'revenue' ? `$${Number(v).toLocaleString()}` : v, name]} />
                <Legend />
                <Bar yAxisId="left" dataKey="bookings" fill="#6366f1" radius={[3, 3, 0, 0]} name={t('analytics.series.bookings', 'Bookings')} />
                <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#32d74b" strokeWidth={2} dot={false} name={t('analytics.series.revenue', 'Revenue')} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><TrendingUp size={16} className="text-[#32d74b]" /> {t('analytics.cards.monthly_revenue', 'Monthly Revenue Trend')}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={revenueTrend ?? []}>
                  <defs>
                    <linearGradient id="gRevenue" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} /><stop offset="95%" stopColor="#32d74b" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  <Area type="monotone" dataKey="revenue" stroke="#32d74b" strokeWidth={2} fill="url(#gRevenue)" name={t('analytics.series.revenue', 'Revenue')} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Hotel size={16} className="text-purple-400" /> {t('analytics.cards.revenue_by_room_type', 'Revenue by Room Type')}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={revenue ?? []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${(v/1000).toFixed(0)}k`} />
                  <YAxis dataKey="room_type" type="category" tick={{ fontSize: 11, fill: '#8e8e93' }} width={85} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  <Bar dataKey="revenue" fill="#8b5cf6" radius={[0, 4, 4, 0]} name={t('analytics.series.revenue', 'Revenue')} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Clock size={16} className="text-blue-400" /> {t('analytics.cards.booking_metrics', 'Booking Metrics Over Time')}</h3>
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={bookingMetrics ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `$${v}`} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any, item: any) => [item?.dataKey === 'avg_spend' ? `$${Number(v).toLocaleString()}` : v, name]} />
                <Legend />
                <Bar yAxisId="left" dataKey="avg_nights" fill="#6366f1" opacity={0.7} radius={[3, 3, 0, 0]} name={t('analytics.series.avg_nights', 'Avg Nights')} />
                <Line yAxisId="right" type="monotone" dataKey="avg_spend" stroke="#f59e0b" strokeWidth={2.5} dot={{ r: 3, fill: '#f59e0b' }} name={t('analytics.series.avg_spend', 'Avg Spend')} />
                <Line yAxisId="left" type="monotone" dataKey="bookings" stroke="#32d74b" strokeWidth={2} dot={false} name={t('analytics.series.bookings', 'Bookings')} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
        </>
      )}

      {/* ════════════════ CRM PIPELINE TAB ════════════════ */}
      {activeTab === 'pipeline' && (
        <>
          {/* MoM Comparison Cards */}
          {revenueComparison && (
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
              {[
                { key: 'revenue', label: t('analytics.kpis.revenue', 'Revenue'), curr: revenueComparison.current.total_revenue, pct: revenueComparison.changes.revenue_pct, fmt: (v: number) => `$${Number(v).toLocaleString()}` },
                { key: 'bookings', label: t('analytics.kpis.bookings', 'Bookings'), curr: revenueComparison.current.total_bookings, pct: revenueComparison.changes.bookings_pct, fmt: (v: number) => v.toLocaleString() },
                { key: 'avg_rate', label: t('analytics.kpis.avg_rate', 'Avg Rate'), curr: revenueComparison.current.avg_rate, pct: revenueComparison.changes.rate_pct, fmt: (v: number) => `$${Number(v).toFixed(0)}` },
                { key: 'new_guests', label: t('analytics.kpis.new_guests', 'New Guests'), curr: revenueComparison.current.new_guests, pct: revenueComparison.changes.guests_pct, fmt: (v: number) => v.toLocaleString() },
              ].map(item => (
                <div key={item.key} className="bg-dark-surface rounded-xl border border-dark-border p-5">
                  <p className="text-xs text-t-secondary mb-2">{item.label}</p>
                  <p className="text-2xl font-bold text-white">{item.fmt(item.curr)}</p>
                  <div className={`flex items-center gap-1 text-xs mt-1 ${item.pct >= 0 ? 'text-[#32d74b]' : 'text-[#ff375f]'}`}>
                    {item.pct >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    <span>{t('analytics.kpis.vs_last_month', { pct: Math.abs(item.pct), defaultValue: '{{pct}}% vs last month' })}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Performance Trends */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">{t('analytics.cards.performance_trends', 'Performance Trends')}</h3><p className="text-xs text-[#636366] mt-0.5">{t('analytics.cards.performance_trends_sub', 'Guests, inquiries, and conversions over time')}</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {CRM_PERIOD_OPTIONS.map(p => (
                  <button key={p.value} onClick={() => setCrmPeriod(p.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${crmPeriod === p.value ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.periods.${p.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={crmTrends ?? []}>
                <defs>
                  <linearGradient id="gGuests" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gInq" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} /><stop offset="95%" stopColor="#f59e0b" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gConf" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#32d74b" stopOpacity={0.25} /><stop offset="95%" stopColor="#32d74b" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                <Legend />
                <Area type="monotone" dataKey="new_guests" stroke="#3b82f6" strokeWidth={2} fill="url(#gGuests)" name={t('analytics.series.new_guests', 'New Guests')} />
                <Area type="monotone" dataKey="new_inquiries" stroke="#f59e0b" strokeWidth={2} fill="url(#gInq)" name={t('analytics.series.inquiries', 'Inquiries')} />
                <Area type="monotone" dataKey="confirmed_inquiries" stroke="#32d74b" strokeWidth={2} fill="url(#gConf)" name={t('analytics.series.confirmed', 'Confirmed')} />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* Conversion Funnel — stage-by-stage rollup with conversion
              rates between adjacent stages, plus win rate and avg
              time-to-close. Honest metric: New is the widest bar
              (everyone who entered) and each subsequent stage rolls
              up everyone who reached it OR beyond, so a closed deal
              still counts toward earlier stages it passed through. */}
          {inquiryFunnel && (
            <Card>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Briefcase size={16} className="text-purple-400" /> {t('analytics.cards.conversion_funnel', 'Conversion Funnel')}
                  </h3>
                  <p className="text-xs text-[#636366] mt-0.5">{t('analytics.cards.conversion_funnel_sub', { months: inquiryFunnel.months, won: inquiryFunnel.won, lost: inquiryFunnel.lost, defaultValue: 'Last {{months}} months · {{won}} won, {{lost}} lost' })}</p>
                </div>
                <div className="flex gap-6 text-right">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-[#636366]">{t('analytics.cards.win_rate', 'Win Rate')}</p>
                    <p className="text-2xl font-bold text-emerald-400 tabular-nums">{inquiryFunnel.win_rate_pct}%</p>
                  </div>
                  {inquiryFunnel.avg_days_to_close !== null && (
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-[#636366]">{t('analytics.cards.avg_days_to_close', 'Avg Days to Close')}</p>
                      <p className="text-2xl font-bold text-blue-400 tabular-nums">{inquiryFunnel.avg_days_to_close}</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                {(inquiryFunnel.stages ?? []).map((s: any, i: number) => {
                  const max = inquiryFunnel.stages[0]?.count || 1
                  const widthPct = max > 0 ? Math.max(2, (s.count / max) * 100) : 2
                  const isWin = s.stage === 'Confirmed'
                  return (
                    <div key={s.stage} className="flex items-center gap-3">
                      <div className="w-32 text-xs text-t-secondary truncate">{s.stage}</div>
                      <div className="flex-1 relative h-7 bg-dark-surface2 rounded-lg overflow-hidden">
                        <div className="h-full rounded-lg flex items-center justify-end px-2"
                          style={{
                            width: `${widthPct}%`,
                            background: isWin
                              ? 'linear-gradient(90deg, rgba(34,197,94,0.4), rgba(34,197,94,0.7))'
                              : `linear-gradient(90deg, rgba(99,102,241,${0.3 + (s.stages?.length ? 0 : i * 0.05)}), rgba(168,85,247,${0.5 + i * 0.05}))`,
                          }}>
                          <span className="text-[11px] font-bold text-white tabular-nums">{s.count}</span>
                        </div>
                      </div>
                      <div className="w-24 text-right text-xs">
                        {i > 0 && (
                          <span className={`tabular-nums font-semibold ${s.rate_from_prev >= 60 ? 'text-emerald-400' : s.rate_from_prev >= 30 ? 'text-amber-400' : 'text-red-400'}`}>
                            {s.rate_from_prev}%
                          </span>
                        )}
                        {i === 0 && <span className="text-[#636366]">{t('analytics.funnel_start', 'start')}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>
          )}

          {/* Inquiry Pipeline + Booking Channels */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Briefcase size={16} className="text-blue-400" /> {t('analytics.cards.inquiry_pipeline', 'Inquiry Pipeline')}</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={inquiryPipeline ?? []} dataKey="count" nameKey="status" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(inquiryPipeline ?? []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(inquiryPipeline ?? []).map((s: any, i: number) => (
                    <div key={s.status} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-[#e0e0e0] flex-1">{s.status}</span>
                      <span className="text-xs font-semibold text-white">{s.count}</span>
                      <span className="text-xs text-[#636366] w-16 text-right">${Number(s.value).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><BarChart3 size={16} className="text-[#32d74b]" /> {t('analytics.cards.booking_channels', 'Booking Channels')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={bookingChannels ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="channel" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [name === 'revenue' ? `$${Number(v).toLocaleString()}` : v, name === 'revenue' ? t('analytics.series.revenue', 'Revenue') : t('analytics.series.bookings', 'Bookings')]} />
                  <Legend />
                  <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('analytics.series.bookings', 'Bookings')} />
                  <Bar dataKey="revenue" fill="#32d74b" radius={[4, 4, 0, 0]} name={t('analytics.series.revenue', 'Revenue')} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Revenue by Property */}
          <Card>
            <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Hotel size={16} className="text-purple-400" /> {t('analytics.cards.revenue_by_property', 'Revenue by Property')}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-t-secondary text-xs uppercase tracking-wide border-b border-dark-border">
                    <th className="pb-3 font-semibold">{t('analytics.table.property', 'Property')}</th>
                    <th className="pb-3 font-semibold text-right">{t('analytics.kpis.bookings', 'Bookings')}</th>
                    <th className="pb-3 font-semibold text-right">{t('analytics.kpis.revenue', 'Revenue')}</th>
                    <th className="pb-3 font-semibold text-right">{t('analytics.table.avg_rate', 'Avg Rate')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-border">
                  {(revByProperty ?? []).map((p: any, i: number) => (
                    <tr key={i} className="hover:bg-dark-surface2 transition-colors">
                      <td className="py-3">
                        <p className="font-semibold text-white">{p.name}</p>
                        <p className="text-xs text-[#636366]">{p.code}</p>
                      </td>
                      <td className="py-3 text-right text-[#a0a0a0]">{p.bookings}</td>
                      <td className="py-3 text-right font-semibold text-white">${Number(p.revenue).toLocaleString()}</td>
                      <td className="py-3 text-right text-[#a0a0a0]">${Number(p.avg_rate).toFixed(0)}</td>
                    </tr>
                  ))}
                  {(revByProperty ?? []).length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-[#636366]">{t('analytics.cards.no_property_data', 'No property data available')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}

      {/* ════════════════ VENUES & GUESTS TAB ════════════════ */}
      {activeTab === 'venues' && (
        <>
          {/* Venue Utilization + Revenue */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><MapPin size={16} className="text-[#32d74b]" /> {t('analytics.cards.venue_utilization', 'Venue Utilization by Type')}</h3>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={venueUtil ?? []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                  <XAxis dataKey="venue_type" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Legend />
                  <Bar dataKey="bookings" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('analytics.series.bookings', 'Bookings')} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><DollarSign size={16} className="text-amber-400" /> {t('analytics.cards.venue_revenue_split', 'Venue Revenue Split')}</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={venueUtil ?? []} dataKey="revenue" nameKey="venue_type" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(venueUtil ?? []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} formatter={(v: any) => `$${Number(v).toLocaleString()}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(venueUtil ?? []).map((v: any, i: number) => (
                    <div key={v.venue_type} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-[#e0e0e0] flex-1 capitalize">{v.venue_type}</span>
                      <span className="text-xs text-[#636366]">${Number(v.revenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </div>

          {/* Occupancy Trend */}
          <Card>
            <div className="flex items-center justify-between mb-5">
              <div><h3 className="text-base font-semibold text-white">{t('analytics.cards.occupancy_rate', 'Occupancy Rate')}</h3><p className="text-xs text-[#636366] mt-0.5">{t('analytics.cards.occupancy_rate_sub', 'Property occupancy over time')}</p></div>
              <div className="flex gap-1 bg-dark-surface2 rounded-lg p-1">
                {CRM_PERIOD_OPTIONS.map(p => (
                  <button key={p.value} onClick={() => setCrmPeriod(p.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${crmPeriod === p.value ? 'bg-primary-600 text-white shadow-sm' : 'text-t-secondary hover:text-white'}`}>
                    {t(`analytics.periods.${p.labelKey}`)}
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={occupancy ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                <YAxis tick={{ fontSize: 11, fill: '#8e8e93' }} tickFormatter={(v) => `${v}%`} />
                <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} formatter={(v: any, name: any) => [name === 'occupancy_rate' ? `${v}%` : Number(v).toLocaleString(), name === 'occupancy_rate' ? t('analytics.series.occupancy_pct', 'Occupancy %') : name]} />
                <Bar dataKey="occupancy_rate" fill="#6366f1" radius={[4, 4, 0, 0]} name={t('analytics.series.occupancy_pct', 'Occupancy %')} opacity={0.7} />
                <Line type="monotone" dataKey="occupancy_rate" stroke="#c9a84c" strokeWidth={2.5} dot={{ r: 3, fill: '#c9a84c' }} name={t('analytics.series.trend', 'Trend')} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>

          {/* VIP Distribution + Nationalities */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><UserCheck size={16} className="text-amber-400" /> {t('analytics.cards.vip_distribution', 'VIP Level Distribution')}</h3>
              <div className="flex gap-6 items-center">
                <ResponsiveContainer width="45%" height={220}>
                  <PieChart>
                    <Pie data={vipDist ?? []} dataKey="count" nameKey="level" cx="50%" cy="50%" innerRadius={50} outerRadius={85}>
                      {(vipDist ?? []).map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={CHART_TOOLTIP} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {(vipDist ?? []).map((v: any, i: number) => (
                    <div key={v.level} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs text-[#e0e0e0] flex-1">{v.level}</span>
                      <span className="text-xs font-semibold text-white">{v.count}</span>
                      <span className="text-xs text-[#636366]">${Number(v.revenue).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Globe size={16} className="text-blue-400" /> {t('analytics.cards.guest_nationalities', 'Guest Nationalities')}</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(nationality ?? []).slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#2c2c2c" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <YAxis dataKey="nationality" type="category" tick={{ fontSize: 11, fill: '#8e8e93' }} width={80} />
                  <Tooltip contentStyle={CHART_TOOLTIP} labelStyle={CHART_LABEL} />
                  <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} name={t('analytics.series.guests', 'Guests')} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* VIP Revenue Radar */}
          {(vipDist ?? []).length > 0 && (
            <Card>
              <h3 className="text-base font-semibold text-white mb-5 flex items-center gap-2"><Award size={16} className="text-purple-400" /> {t('analytics.cards.vip_revenue_impact', 'VIP Revenue Impact')}</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RadarChart data={vipDist ?? []}>
                  <PolarGrid stroke="#2c2c2c" />
                  <PolarAngleAxis dataKey="level" tick={{ fontSize: 11, fill: '#8e8e93' }} />
                  <PolarRadiusAxis tick={{ fontSize: 10, fill: '#636366' }} />
                  <Tooltip contentStyle={CHART_TOOLTIP} />
                  <Radar name={t('analytics.series.revenue', 'Revenue')} dataKey="revenue" stroke="#c9a84c" fill="#c9a84c" fillOpacity={0.2} />
                  <Radar name={t('analytics.series.guests', 'Guests')} dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </>
      )}

      {/* ════════════════ CHAT TAB ════════════════
          Stats moved out of /engagement so the operational page stays
          focused on the conversation feed. Same /v1/admin/engagement/kpis
          endpoint powers both. */}
      {activeTab === 'chat' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            { key: 'online_now',  label: t('analytics.chat.online_now', 'Online now'),       icon: <Wifi size={18} />,        tint: 'text-emerald-400', bg: 'bg-emerald-500/15', value: chatKpis?.data?.online_now?.value ?? 0, sub: chatKpis?.data?.online_now?.detail },
            { key: 'leads',       label: t('analytics.chat.leads', 'Leads'),                 icon: <Sparkles size={18} />,    tint: 'text-amber-400',   bg: 'bg-amber-500/15',   value: chatKpis?.data?.hot_leads?.value ?? 0,  sub: chatKpis?.data?.hot_leads?.detail },
            { key: 'unanswered',  label: t('analytics.chat.unanswered', 'Unanswered'),       icon: <AlertTriangle size={18}/>, tint: 'text-red-400',    bg: 'bg-red-500/15',     value: chatKpis?.data?.unanswered?.value ?? 0, sub: chatKpis?.data?.unanswered?.detail },
            { key: 'ai_handled',  label: t('analytics.chat.ai_handled_today', 'AI handled today'), icon: <Bot size={18} />,  tint: 'text-purple-400',  bg: 'bg-purple-500/15',  value: chatKpis?.data?.ai_handled?.value ?? 0, sub: chatKpis?.data?.ai_handled?.detail },
          ].map(c => (
            <Card key={c.key}>
              <div className="flex items-start justify-between mb-3">
                <span className="text-[11px] uppercase tracking-wider text-t-secondary">{c.label}</span>
                <div className={`p-2 rounded-lg ${c.bg} ${c.tint}`}>{c.icon}</div>
              </div>
              <p className="text-3xl font-bold text-white tabular-nums">{Number(c.value).toLocaleString()}</p>
              {c.sub && <p className="text-xs text-t-secondary mt-1">{c.sub}</p>}
            </Card>
          ))}
            <div className="md:col-span-2 xl:col-span-4 text-xs text-t-secondary">
              <Link to="/engagement" className="text-primary-400 hover:underline">{t('analytics.chat.open_engagement', 'Open the Engagement feed →')}</Link>
            </div>
          </div>

          {/* Deeper chatbot analytics — conversation volume, AI resolution
              rate, lead capture, intent breakdown, top pages, etc.
              Relocated from /chatbot-setup → Analytics tab. */}
          <div className="pt-2 border-t border-dark-border">
            <Suspense fallback={<div className="text-center text-[#636366] py-12">{t('analytics.loading', 'Loading…')}</div>}>
              <ChatbotAnalytics />
            </Suspense>
          </div>
        </div>
      )}

      {/* ════════════════ LEADS TAB ════════════════
          Same /v1/admin/inquiries/kpis endpoint that used to populate the
          KPI strip on /inquiries. PipelineInsights (the deeper analytics
          card) is rendered on /reports — link out from here. */}
      {activeTab === 'leads' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-4">
            {[
              { key: 'total',     label: t('analytics.leads.total', 'Total Leads'),      icon: <Users size={18} />,         tint: 'text-blue-400',    bg: 'bg-blue-500/15',    value: leadsKpis?.total ?? 0,            delta: leadsKpis?.total_delta_pct, sub: t('analytics.leads.vs_last_month', 'vs last month') },
              { key: 'due',       label: t('analytics.leads.due_today', 'Due Today'),    icon: <Clock size={18} />,         tint: 'text-amber-400',   bg: 'bg-amber-500/15',   value: leadsKpis?.due_today ?? 0 },
              { key: 'overdue',   label: t('analytics.leads.overdue', 'Overdue'),        icon: <AlertTriangle size={18} />, tint: 'text-red-400',     bg: 'bg-red-500/15',     value: leadsKpis?.overdue ?? 0 },
              { key: 'value',     label: t('analytics.leads.est_value', 'Estimated Value'), icon: <DollarSign size={18} />, tint: 'text-emerald-400', bg: 'bg-emerald-500/15', value: leadsKpis?.estimated_value ?? 0, money: true },
              { key: 'new',       label: t('analytics.leads.new_this_week', 'New This Week'), icon: <Sparkles size={18} />, tint: 'text-purple-400',  bg: 'bg-purple-500/15',  value: leadsKpis?.new_this_week ?? 0,    delta: leadsKpis?.new_delta_pct, sub: t('analytics.leads.vs_last_week', 'vs last week') },
            ].map(c => (
              <Card key={c.key}>
                <div className="flex items-start justify-between mb-3">
                  <span className="text-[11px] uppercase tracking-wider text-t-secondary">{c.label}</span>
                  <div className={`p-2 rounded-lg ${c.bg} ${c.tint}`}>{c.icon}</div>
                </div>
                <p className="text-3xl font-bold text-white tabular-nums">
                  {c.money ? `$${Number(c.value).toLocaleString()}` : Number(c.value).toLocaleString()}
                </p>
                {c.delta != null && (
                  <div className={`flex items-center gap-1 text-[11px] mt-1 ${c.delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {c.delta >= 0 ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    <span className="font-semibold">{Math.abs(c.delta)}%</span>
                    <span className="text-t-secondary">{c.sub}</span>
                  </div>
                )}
              </Card>
            ))}
          </div>
          <div className="text-xs text-t-secondary">
            <Link to="/reports" className="text-primary-400 hover:underline">{t('analytics.leads.deep_dive', 'Pipeline deep-dive on Reports →')}</Link>
            <span className="mx-2 text-gray-700">·</span>
            <Link to="/inquiries" className="text-primary-400 hover:underline">{t('analytics.leads.open_pipeline', 'Open the Leads pipeline →')}</Link>
          </div>
        </div>
      )}

      {/* ════════════════ DEALS TAB ════════════════
          Mirrors the /v1/admin/deals/kpis shape from the Deals page.
          KPI grid moved here so /deals stays a focused workflow page. */}
      {activeTab === 'deals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              { key: 'total',  label: t('analytics.deals.total', 'Total Deals'),                icon: <Package size={16} />,        tint: 'text-blue-400',    bg: 'bg-blue-500/15',    value: dealsKpis?.total ?? 0, sub: t('analytics.deals.all_active', 'All active deals') },
              { key: 'await',  label: t('analytics.deals.awaiting_payment', 'Awaiting Payment'), icon: <CreditCard size={16} />,    tint: 'text-amber-400',   bg: 'bg-amber-500/15',   value: dealsKpis?.awaiting_payment?.count ?? 0, sub: dealsKpis?.awaiting_payment?.value != null ? `$${Number(dealsKpis.awaiting_payment.value).toLocaleString()}` : '' },
              { key: 'prep',   label: t('analytics.deals.preparation', 'Preparation'),          icon: <Settings2 size={16} />,      tint: 'text-purple-400',  bg: 'bg-purple-500/15',  value: dealsKpis?.design_needed?.count ?? 0,    sub: dealsKpis?.design_needed?.value != null ? `$${Number(dealsKpis.design_needed.value).toLocaleString()}` : '' },
              { key: 'prog',   label: t('analytics.deals.in_progress', 'In Progress'),          icon: <PlayCircle size={16} />,     tint: 'text-sky-400',     bg: 'bg-sky-500/15',     value: dealsKpis?.in_production?.count ?? 0,    sub: dealsKpis?.in_production?.value != null ? `$${Number(dealsKpis.in_production.value).toLocaleString()}` : '' },
              { key: 'ready',  label: t('analytics.deals.ready', 'Ready'),                      icon: <PackageCheck size={16} />,   tint: 'text-emerald-400', bg: 'bg-emerald-500/15', value: dealsKpis?.ready_to_ship?.count ?? 0,    sub: dealsKpis?.ready_to_ship?.value != null ? `$${Number(dealsKpis.ready_to_ship.value).toLocaleString()}` : '' },
              { key: 'done',   label: t('analytics.deals.completed_month', 'Completed This Month'), icon: <CheckCircle2 size={16} />, tint: 'text-green-400',   bg: 'bg-green-500/15',   value: dealsKpis?.completed_month?.count ?? 0, sub: dealsKpis?.completed_month?.value != null ? `$${Number(dealsKpis.completed_month.value).toLocaleString()}` : '' },
            ].map(c => (
              <Card key={c.key}>
                <div className="flex items-start gap-2 mb-2">
                  <div className={`p-2 rounded-lg ${c.bg} ${c.tint}`}>{c.icon}</div>
                  <span className="text-[11px] text-t-secondary leading-tight">{c.label}</span>
                </div>
                <p className="text-2xl font-bold text-white tabular-nums">{Number(c.value).toLocaleString()}</p>
                {c.sub && <p className="text-[11px] text-t-secondary mt-1">{c.sub}</p>}
              </Card>
            ))}
          </div>
          <div className="text-xs text-t-secondary">
            <Link to="/deals" className="text-primary-400 hover:underline">{t('analytics.deals.open_deals', 'Open the Deals pipeline →')}</Link>
          </div>
        </div>
      )}
    </div>
  )
}
