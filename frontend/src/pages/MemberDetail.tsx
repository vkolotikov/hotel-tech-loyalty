import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api, resolveImage } from '../lib/api'
import { SendReviewButton } from '../components/SendReviewButton'
import { ContactActions } from '../components/ContactActions'
import { ActivityTimeline } from '../components/ActivityTimeline'
import { JourneyTimeline } from '../components/JourneyTimeline'
import { TierBadge } from '../components/ui/TierBadge'
import { DatePicker, normalizeDate } from '../components/ui/DatePicker'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Sparkles, Pencil, Save, X, Camera, Hotel, FileText, Crown, MapPin, Tag,
  Activity, StickyNote, MoreHorizontal, Mail, UserX, UserCheck, Trash2, Receipt,
  History, Plus, Minus, Loader2, Settings as SettingsIcon, LayoutDashboard,
} from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

const LIFECYCLE_COLORS: Record<string, string> = {
  'Prospect': 'bg-gray-500/20 text-gray-300',
  'Lead': 'bg-gray-500/20 text-gray-300',
  'First-Time Guest': 'bg-blue-500/20 text-blue-300',
  'Returning Guest': 'bg-emerald-500/20 text-emerald-300',
  'VIP': 'bg-amber-500/20 text-amber-300',
  'Corporate': 'bg-purple-500/20 text-purple-300',
  'Inactive': 'bg-red-500/20 text-red-300',
}

export function MemberDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()
  const [urlParams, setUrlParams] = useSearchParams()
  const activeTab = urlParams.get('tab') ?? 'overview'
  const selectTab = (key: string) => {
    setUrlParams(prev => {
      const next = new URLSearchParams(prev)
      if (key === 'overview') next.delete('tab')
      else next.set('tab', key)
      return next
    })
  }

  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', nationality: '', language: '', date_of_birth: '', tier_id: '', tier_override_until: '', is_active: true })
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const { staff } = useAuthStore()
  const isAdmin = staff?.role === 'super_admin' || staff?.role === 'manager'

  // Unified Adjust-Points panel state. One form, mode toggles between
  // +Award and -Redeem so admins don't context-switch between two cards.
  const [pointsMode, setPointsMode] = useState<'award' | 'redeem'>('award')
  const [pointsForm, setPointsForm] = useState({ points: '', description: '' })

  // Header kebab menu (Edit / Resend welcome / Toggle / Delete).
  const [kebabOpen, setKebabOpen] = useState(false)
  const kebabRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!kebabOpen) return
    const onClick = (e: MouseEvent) => {
      if (kebabRef.current && !kebabRef.current.contains(e.target as Node)) setKebabOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [kebabOpen])

  const { data, isLoading } = useQuery({
    queryKey: ['member', id],
    queryFn: () => api.get(`/v1/admin/members/${id}`).then(r => r.data),
  })

  const { data: aiData, refetch: refetchAi, isFetching: aiLoading } = useQuery({
    queryKey: ['member-ai', id],
    queryFn: () => api.get(`/v1/admin/members/${id}/ai-insights`).then(r => r.data),
    enabled: false,
  })

  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => {
      if (payload._hasFile) {
        const formData = new FormData()
        formData.append('_method', 'PUT')
        Object.entries(payload).forEach(([key, value]) => {
          if (key === '_hasFile') return
          if (value instanceof File) {
            formData.append(key, value)
          } else if (value !== null && value !== undefined) {
            formData.append(key, String(value))
          }
        })
        return api.post(`/v1/admin/members/${id}`, formData)
      }
      return api.put(`/v1/admin/members/${id}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      toast.success('Member updated')
      setEditing(false)
      setAvatarFile(null)
      setAvatarPreview(null)
    },
    onError: (e: any) => {
      const errors = e.response?.data?.errors
      if (errors) {
        const first = Object.values(errors)[0] as string[]
        toast.error(first[0])
      } else {
        toast.error(e.response?.data?.message || 'Update failed')
      }
    },
  })

  const startEditing = () => {
    setEditForm({
      name: user?.name ?? '',
      email: user?.email ?? '',
      phone: user?.phone ?? '',
      nationality: user?.nationality ?? '',
      language: user?.language ?? '',
      date_of_birth: normalizeDate(user?.date_of_birth ?? ''),
      tier_id: String(member?.tier_id ?? ''),
      tier_override_until: member?.tier_override_until ? String(member.tier_override_until).slice(0, 10) : '',
      is_active: member?.is_active ?? true,
    })
    setAvatarFile(null)
    setAvatarPreview(null)
    setEditing(true)
    selectTab('settings')
    setKebabOpen(false)
  }

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setAvatarPreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const handleSaveEdit = () => {
    const payload: Record<string, any> = {
      name: editForm.name,
      email: editForm.email,
      phone: editForm.phone || null,
      nationality: editForm.nationality || null,
      language: editForm.language || null,
      date_of_birth: editForm.date_of_birth || null,
      tier_id: editForm.tier_id ? Number(editForm.tier_id) : undefined,
      tier_override_until: editForm.tier_override_until || null,
      is_active: editForm.is_active ? '1' : '0',
    }
    if (avatarFile) {
      payload.avatar = avatarFile
      payload._hasFile = true
    }
    updateMutation.mutate(payload)
  }

  const awardMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/points/award', {
      member_id: Number(id),
      points: Number(pointsForm.points),
      description: pointsForm.description || 'Staff award',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      toast.success(`${pointsForm.points} points awarded`)
      setPointsForm({ points: '', description: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Failed'),
  })

  const resendWelcomeMutation = useMutation({
    mutationFn: () => api.post(`/v1/admin/members/${id}/resend-welcome`).then(r => r.data),
    onSuccess: (data: any) => { toast.success(data?.message ?? 'Welcome email sent'); setKebabOpen(false) },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not send email'),
  })

  const deactivateMutation = useMutation({
    mutationFn: () => api.patch(`/v1/admin/members/${id}/deactivate`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      qc.invalidateQueries({ queryKey: ['admin-members'] })
      toast.success(member?.is_active ? 'Member deactivated' : 'Member reactivated')
      setKebabOpen(false)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not update member status'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/v1/admin/members/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-members'] })
      toast.success('Member deleted')
      navigate('/members')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not delete member'),
  })

  const redeemMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/points/redeem', {
      member_id: Number(id),
      points: Number(pointsForm.points),
      description: pointsForm.description || 'Staff redemption',
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['member', id] })
      toast.success(`${pointsForm.points} points redeemed`)
      setPointsForm({ points: '', description: '' })
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Insufficient points'),
  })

  if (isLoading) return <div className="flex items-center justify-center h-64 text-[#636366]">Loading...</div>

  const member = data?.member
  const user = member?.user
  const tier = member?.tier
  const linkedGuest = data?.linked_guest

  const canAdjustPoints = isAdmin || staff?.can_award_points || staff?.can_redeem_points

  const tabs: { key: string; label: string; icon: React.ReactNode; show: boolean }[] = [
    { key: 'overview',     label: t('memberDetail.tabs.overview',     'Overview'),     icon: <LayoutDashboard size={15} />, show: true },
    { key: 'transactions', label: t('memberDetail.tabs.transactions', 'Transactions'), icon: <Receipt size={15} />,         show: true },
    { key: 'journey',      label: t('memberDetail.tabs.journey',      'Journey'),      icon: <History size={15} />,         show: !!linkedGuest },
    { key: 'crm',          label: t('memberDetail.tabs.crm_profile',  'CRM Profile'),  icon: <Crown size={15} />,           show: !!linkedGuest },
    { key: 'settings',     label: t('memberDetail.tabs.settings',     'Settings'),     icon: <SettingsIcon size={15} />,    show: true },
  ].filter(t => t.show)

  return (
    <div className="space-y-5">
      {/* ─── HERO ─── compact identity strip + headline stats. Replaces the
          old stacked stats-cards row that ate 25% of the viewport. */}
      <div className="bg-dark-surface rounded-2xl border border-dark-border overflow-hidden">
        <div className="p-5 md:p-6 flex flex-col gap-5">
          <div className="flex items-start gap-3 md:gap-4">
            <button onClick={() => navigate('/members')} className="p-2 hover:bg-dark-surface2 rounded-lg transition-colors flex-shrink-0 mt-1">
              <ArrowLeft size={18} className="text-[#a0a0a0]" />
            </button>
            {user?.avatar_url ? (
              <img
                src={resolveImage(user.avatar_url)!}
                alt={user.name}
                className="w-14 h-14 md:w-16 md:h-16 rounded-full object-cover border-2 border-dark-border flex-shrink-0"
              />
            ) : (
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-xl md:text-2xl font-bold text-primary-400">{user?.name?.charAt(0)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-white truncate">{user?.name}</h1>
                {tier && <TierBadge tier={tier.name} color={tier.color_hex} />}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${member?.is_active ? 'bg-[#32d74b]/15 text-[#32d74b]' : 'bg-red-500/15 text-red-400'}`}>
                  {member?.is_active ? t('members.filters.active', 'Active') : t('members.filters.inactive', 'Inactive')}
                </span>
              </div>
              <p className="text-xs md:text-sm text-t-secondary mt-1 truncate">{user?.email} · {member?.member_number}</p>
              <div className="mt-2">
                <ContactActions email={user?.email} phone={user?.phone} compact />
              </div>
            </div>

            {/* Header action cluster — review, AI, kebab. Kebab hides
                destructive surface area (deactivate / delete) until needed. */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {member?.id && <SendReviewButton target={{ memberId: member.id }} />}
              {(isAdmin || staff?.can_view_analytics) && (
                <button
                  onClick={() => refetchAi()}
                  disabled={aiLoading}
                  className="hidden sm:flex items-center gap-2 bg-primary-600 text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
                >
                  <Sparkles size={14} />
                  <span className="whitespace-nowrap">{aiLoading ? t('memberDetail.analyzing', 'Analyzing…') : t('memberDetail.ai_analysis', 'AI Analysis')}</span>
                </button>
              )}
              {isAdmin && (
                <div className="relative" ref={kebabRef}>
                  <button
                    onClick={() => setKebabOpen(v => !v)}
                    className="p-2 rounded-lg bg-dark-surface2 hover:bg-dark-surface3 text-[#a0a0a0] hover:text-white transition-colors"
                    title={t('memberDetail.more_actions', 'More actions')}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                  {kebabOpen && (
                    <div className="absolute right-0 top-full mt-1 w-52 bg-dark-surface border border-dark-border rounded-lg shadow-2xl z-30 py-1">
                      <button onClick={startEditing} className="w-full px-3 py-2 text-left text-sm text-white hover:bg-dark-surface2 flex items-center gap-2">
                        <Pencil size={14} className="text-primary-400" /> {t('memberDetail.kebab.edit_info', 'Edit info')}
                      </button>
                      <button
                        onClick={() => resendWelcomeMutation.mutate()}
                        disabled={resendWelcomeMutation.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-dark-surface2 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Mail size={14} className="text-primary-400" /> {t('memberDetail.kebab.resend_welcome', 'Resend welcome email')}
                      </button>
                      <button
                        onClick={() => deactivateMutation.mutate()}
                        disabled={deactivateMutation.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-white hover:bg-dark-surface2 flex items-center gap-2 disabled:opacity-50"
                      >
                        {member?.is_active
                          ? <><UserX size={14} className="text-amber-400" /> {t('memberDetail.kebab.deactivate', 'Deactivate')}</>
                          : <><UserCheck size={14} className="text-emerald-400" /> {t('memberDetail.kebab.reactivate', 'Reactivate')}</>}
                      </button>
                      <div className="border-t border-dark-border my-1" />
                      <button
                        onClick={() => {
                          if (confirm(t('memberDetail.kebab.delete_confirm', { name: user?.name ?? 'this member', defaultValue: 'Permanently delete {{name}}? All their data will be removed.' }))) {
                            deleteMutation.mutate()
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        className="w-full px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10 flex items-center gap-2 disabled:opacity-50"
                      >
                        <Trash2 size={14} /> {t('memberDetail.kebab.delete', 'Delete permanently')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Headline stats — Current Points dominates as the program's
              single most important number; the other three sit as a quiet
              row beneath. */}
          <div className="grid grid-cols-3 gap-4 md:gap-6 pt-4 border-t border-dark-border">
            <div className="col-span-3 sm:col-span-1">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary">{t('memberDetail.hero.current_points', 'Current points')}</p>
              <p className="text-4xl md:text-5xl font-bold text-primary-400 mt-1 leading-none">
                {(member?.current_points ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-t-secondary mt-2">
                {/* Two-token line: bold lifetime count + plain "lifetime" label.
                    Split into a `<Trans>`-style template so the order can flip
                    in languages that put the noun first (e.g. RU "за всё время"
                    sits AFTER the number, others may differ). */}
                <span className="text-emerald-400 font-semibold">{(member?.lifetime_points ?? 0).toLocaleString()}</span>
                {' '}{t('memberDetail.hero.lifetime_label', 'lifetime')}
              </p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary">{t('memberDetail.hero.stays', 'Stays')}</p>
              <p className="text-2xl md:text-3xl font-bold text-purple-400 mt-1">{data?.stats?.total_bookings ?? 0}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary">{t('memberDetail.hero.total_spent', 'Total spent')}</p>
              <p className="text-2xl md:text-3xl font-bold text-orange-400 mt-1">${(data?.stats?.total_spent ?? 0).toLocaleString()}</p>
            </div>
            <div className="text-center sm:text-left">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary">{t('memberDetail.hero.member_since', 'Member since')}</p>
              <p className="text-base md:text-lg font-semibold text-white mt-1">
                {member?.joined_at ? new Date(member.joined_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : '—'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── TAB BAR ─── deep-linkable via ?tab= */}
      <div className="flex gap-1 border-b border-dark-border overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => selectTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors border-b-2 ${
              activeTab === t.key
                ? 'text-primary-400 border-primary-400'
                : 'text-t-secondary border-transparent hover:text-white'
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* ─── TAB CONTENT ─── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            {/* Recent transactions (top 5). Full ledger lives on the
                Transactions tab. */}
            <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
              <div className="px-5 py-3 border-b border-dark-border flex items-center justify-between">
                <h2 className="text-sm font-semibold text-white">{t('memberDetail.recent_activity', 'Recent Activity')}</h2>
                {(data?.recent_transactions?.length ?? 0) > 5 && (
                  <button onClick={() => selectTab('transactions')} className="text-xs text-primary-400 hover:underline">
                    {t('memberDetail.see_all', 'See all')}
                  </button>
                )}
              </div>
              <div className="divide-y divide-dark-border">
                {(data?.recent_transactions ?? []).length === 0 ? (
                  <p className="text-center text-[#636366] py-8 text-sm">{t('memberDetail.no_transactions', 'No transactions yet')}</p>
                ) : (data?.recent_transactions ?? []).slice(0, 5).map((tx: any) => (
                  <div key={tx.id} className="flex items-center gap-4 px-5 py-3">
                    <div className={`text-sm font-bold tabular-nums w-16 ${tx.points > 0 ? 'text-[#32d74b]' : 'text-[#ff375f]'}`}>
                      {tx.points > 0 ? '+' : ''}{tx.points.toLocaleString()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{tx.description}</p>
                      <p className="text-xs text-[#636366]">{new Date(tx.created_at).toLocaleDateString()}</p>
                    </div>
                    <div className="text-xs text-[#636366] text-right tabular-nums">
                      <p>{tx.balance_after?.toLocaleString()} pts</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Analysis Panel — appears once the user clicks AI Analysis */}
            {aiData && (
              <div className="bg-primary-500/10 rounded-xl border border-primary-500/20 p-5">
                <h3 className="font-semibold text-primary-400 mb-3 flex items-center gap-2">
                  <Sparkles size={15} /> {t('memberDetail.ai.title', 'AI Insights')}
                </h3>
                {aiData.churn_risk !== undefined && (
                  <div className="mb-3">
                    <p className="text-xs text-primary-400 font-semibold mb-1">{t('memberDetail.ai.churn_risk', 'Churn Risk')}</p>
                    <div className="w-full bg-dark-surface3 rounded-full h-2">
                      <div className="bg-primary-500 h-2 rounded-full" style={{ width: `${(aiData.churn_risk ?? 0) * 100}%` }} />
                    </div>
                    <p className="text-xs text-primary-400 mt-1">{Math.round((aiData.churn_risk ?? 0) * 100)}%</p>
                  </div>
                )}
                {aiData.personalized_offer && (
                  <div className="mb-3">
                    <p className="text-xs text-primary-400 font-semibold mb-1">{t('memberDetail.ai.suggested_offer', 'Suggested Offer')}</p>
                    <p className="text-sm text-white">{typeof aiData.personalized_offer === 'string' ? aiData.personalized_offer : aiData.personalized_offer?.title}</p>
                  </div>
                )}
                {aiData.upsell_suggestion && (
                  <div>
                    <p className="text-xs text-primary-400 font-semibold mb-1">{t('memberDetail.ai.upsell_script', 'Upsell Script')}</p>
                    <p className="text-sm text-[#a0a0a0] italic">"{aiData.upsell_suggestion}"</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <MemberQrCard memberId={id!} memberNumber={member?.member_number} />

            {/* Unified Adjust Points panel — single form, Award/Redeem
                toggle replaces what used to be two stacked cards. */}
            {canAdjustPoints && (
              <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
                <h3 className="font-semibold text-white mb-3">{t('memberDetail.adjust.title', 'Adjust Points')}</h3>
                <div className="inline-flex w-full bg-dark-surface2 border border-dark-border rounded-lg p-0.5 mb-3">
                  <button
                    onClick={() => setPointsMode('award')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      pointsMode === 'award' ? 'bg-emerald-500/20 text-emerald-300' : 'text-t-secondary hover:text-white'
                    }`}
                  >
                    <Plus size={13} /> {t('memberDetail.adjust.award', 'Award')}
                  </button>
                  <button
                    onClick={() => setPointsMode('redeem')}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      pointsMode === 'redeem' ? 'bg-red-500/20 text-red-300' : 'text-t-secondary hover:text-white'
                    }`}
                  >
                    <Minus size={13} /> {t('memberDetail.adjust.redeem', 'Redeem')}
                  </button>
                </div>

                <input
                  type="number"
                  placeholder={t('memberDetail.adjust.points_placeholder', 'Points')}
                  value={pointsForm.points}
                  onChange={e => setPointsForm(f => ({ ...f, points: e.target.value }))}
                  className={`w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-xl font-bold text-center tabular-nums focus:outline-none focus:ring-2 mb-2 ${
                    pointsMode === 'award' ? 'text-emerald-400 focus:ring-emerald-500' : 'text-red-400 focus:ring-red-500'
                  }`}
                />
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {[100, 250, 500, 1000].map(n => (
                    <button
                      key={n}
                      onClick={() => setPointsForm(f => ({ ...f, points: String(n) }))}
                      className="px-2.5 py-1 rounded-md text-xs font-semibold bg-dark-surface2 hover:bg-dark-surface3 text-[#a0a0a0] hover:text-white transition-colors"
                    >
                      {pointsMode === 'award' ? '+' : '−'}{n}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder={pointsMode === 'award'
                    ? t('memberDetail.adjust.reason_award',  'Reason (e.g. Staff courtesy)')
                    : t('memberDetail.adjust.reason_redeem', 'Reason (e.g. Room upgrade)')}
                  value={pointsForm.description}
                  onChange={e => setPointsForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] mb-3 focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
                <button
                  onClick={() => (pointsMode === 'award' ? awardMutation : redeemMutation).mutate()}
                  disabled={!pointsForm.points || awardMutation.isPending || redeemMutation.isPending}
                  className={`w-full py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
                    pointsMode === 'award' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {(awardMutation.isPending || redeemMutation.isPending)
                    ? t('memberDetail.adjust.working', 'Working…')
                    : pointsMode === 'award'
                      ? t('memberDetail.adjust.award_btn',  'Award points')
                      : t('memberDetail.adjust.redeem_btn', 'Redeem points')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'transactions' && (
        <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-border">
            <h2 className="text-sm font-semibold text-white">{t('memberDetail.all_transactions', 'All Transactions')}</h2>
          </div>
          <div className="divide-y divide-dark-border">
            {(data?.recent_transactions ?? []).length === 0 ? (
              <p className="text-center text-[#636366] py-10 text-sm">{t('memberDetail.no_transactions', 'No transactions yet')}</p>
            ) : (data?.recent_transactions ?? []).map((tx: any) => (
              <div key={tx.id} className="flex items-center gap-4 px-5 py-3">
                <div className={`text-sm font-bold tabular-nums w-20 ${tx.points > 0 ? 'text-[#32d74b]' : 'text-[#ff375f]'}`}>
                  {tx.points > 0 ? '+' : ''}{tx.points.toLocaleString()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white truncate">{tx.description}</p>
                  <p className="text-xs text-[#636366]">{new Date(tx.created_at).toLocaleString()}</p>
                </div>
                <div className="text-xs text-[#636366] text-right tabular-nums">
                  <p>{tx.balance_after?.toLocaleString()} pts</p>
                  {tx.type && <p className="text-[10px] uppercase">{tx.type}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'journey' && linkedGuest && (
        <div className="bg-dark-surface rounded-xl border border-dark-border p-5">
          <h2 className="font-semibold text-white mb-3">{t('memberDetail.customer_journey', 'Customer Journey')}</h2>
          <JourneyTimeline
            activities={linkedGuest.activities ?? []}
            inquiries={linkedGuest.inquiries ?? []}
            reservations={linkedGuest.reservations ?? []}
            bookings={linkedGuest.bookings ?? []}
          />
        </div>
      )}

      {activeTab === 'crm' && linkedGuest && (
        <div className="bg-dark-surface rounded-xl border border-dark-border overflow-hidden">
          <div className="px-6 py-4 border-b border-dark-border flex items-center gap-2 flex-wrap">
            <Crown size={16} className="text-primary-400" />
            <h2 className="font-semibold text-white">Linked CRM Guest</h2>
            {linkedGuest.lifecycle_status && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LIFECYCLE_COLORS[linkedGuest.lifecycle_status] ?? 'bg-gray-500/20 text-gray-300'}`}>
                {linkedGuest.lifecycle_status}
              </span>
            )}
            {linkedGuest.vip_level && linkedGuest.vip_level !== 'Standard' && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-400">
                VIP: {linkedGuest.vip_level}
              </span>
            )}
            {linkedGuest.lead_source && (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-500/20 text-indigo-300">
                {linkedGuest.lead_source}
              </span>
            )}
          </div>
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Total Stays',  value: linkedGuest.total_stays ?? 0, color: 'text-blue-400' },
                { label: 'Total Nights', value: linkedGuest.total_nights ?? 0, color: 'text-purple-400' },
                { label: 'CRM Revenue',  value: `$${Number(linkedGuest.total_revenue ?? 0).toLocaleString()}`, color: 'text-[#32d74b]' },
                { label: 'Last Stay',    value: linkedGuest.last_stay_date ? new Date(linkedGuest.last_stay_date).toLocaleDateString() : '—', color: 'text-[#a0a0a0]' },
              ].map(s => (
                <div key={s.label} className="text-center">
                  <p className="text-xs text-t-secondary">{s.label}</p>
                  <p className={`text-lg font-bold mt-0.5 ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-xs pt-2 border-t border-dark-border">
              {linkedGuest.company && (
                <div className="flex justify-between"><span className="text-t-secondary">Company</span><span className="text-white">{linkedGuest.company}{linkedGuest.position_title ? ` · ${linkedGuest.position_title}` : ''}</span></div>
              )}
              {linkedGuest.guest_type && (
                <div className="flex justify-between"><span className="text-t-secondary">Guest type</span><span className="text-white">{linkedGuest.guest_type}</span></div>
              )}
              {linkedGuest.owner_name && (
                <div className="flex justify-between"><span className="text-t-secondary">Owner</span><span className="text-white">{linkedGuest.owner_name}</span></div>
              )}
              {linkedGuest.importance && (
                <div className="flex justify-between"><span className="text-t-secondary">Importance</span><span className="text-white">{linkedGuest.importance}</span></div>
              )}
              {(linkedGuest.country || linkedGuest.city) && (
                <div className="flex justify-between"><span className="text-t-secondary flex items-center gap-1"><MapPin size={11}/>Location</span><span className="text-white">{[linkedGuest.city, linkedGuest.country].filter(Boolean).join(', ')}</span></div>
              )}
              {linkedGuest.address && (
                <div className="flex justify-between"><span className="text-t-secondary">Address</span><span className="text-white truncate ml-2">{linkedGuest.address}</span></div>
              )}
              {linkedGuest.preferred_room_type && (
                <div className="flex justify-between"><span className="text-t-secondary">Pref. room</span><span className="text-white">{linkedGuest.preferred_room_type}</span></div>
              )}
              {linkedGuest.preferred_floor && (
                <div className="flex justify-between"><span className="text-t-secondary">Pref. floor</span><span className="text-white">{linkedGuest.preferred_floor}</span></div>
              )}
              {linkedGuest.preferred_language && (
                <div className="flex justify-between"><span className="text-t-secondary">Pref. language</span><span className="text-white">{linkedGuest.preferred_language}</span></div>
              )}
              {linkedGuest.dietary_preferences && (
                <div className="flex justify-between"><span className="text-t-secondary">Dietary</span><span className="text-white truncate ml-2">{linkedGuest.dietary_preferences}</span></div>
              )}
              {linkedGuest.last_activity_at && (
                <div className="flex justify-between"><span className="text-t-secondary">Last activity</span><span className="text-white">{new Date(linkedGuest.last_activity_at).toLocaleDateString()}</span></div>
              )}
              {linkedGuest.first_stay_date && (
                <div className="flex justify-between"><span className="text-t-secondary">First stay</span><span className="text-white">{new Date(linkedGuest.first_stay_date).toLocaleDateString()}</span></div>
              )}
            </div>

            {(linkedGuest.tags?.length ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                <Tag size={12} className="text-[#636366]" />
                {linkedGuest.tags.map((t: any) => (
                  <span key={t.id} className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-primary-500/15 text-primary-300">{t.name}</span>
                ))}
              </div>
            )}

            {linkedGuest.notes && (
              <div className="bg-dark-surface2 rounded-lg px-3 py-2">
                <p className="text-[11px] font-medium text-[#636366] mb-1 flex items-center gap-1"><StickyNote size={11}/> Notes</p>
                <p className="text-xs text-[#a0a0a0] whitespace-pre-wrap">{linkedGuest.notes}</p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-medium text-[#a0a0a0] mb-2 flex items-center gap-1.5">
                <Activity size={13} /> Activity Log
              </h3>
              <ActivityTimeline guestId={linkedGuest.id} initialActivities={linkedGuest.activities} />
            </div>

            {(linkedGuest.reservations?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[#a0a0a0] mb-2 flex items-center gap-1.5">
                  <Hotel size={13} /> Reservations
                </h3>
                <div className="space-y-1.5">
                  {linkedGuest.reservations.slice(0, 5).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-xs bg-dark-surface2 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-white font-medium">{r.property?.name ?? 'Property'}</span>
                        <span className="text-[#636366] ml-2">{r.room_type}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[#a0a0a0]">{r.check_in} → {r.check_out}</span>
                        <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          r.status === 'confirmed' ? 'bg-green-500/20 text-green-400' :
                          r.status === 'checked_in' ? 'bg-blue-500/20 text-blue-400' :
                          r.status === 'checked_out' ? 'bg-gray-500/20 text-gray-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }`}>{r.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(linkedGuest.inquiries?.length ?? 0) > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[#a0a0a0] mb-2 flex items-center gap-1.5">
                  <FileText size={13} /> Inquiries
                </h3>
                <div className="space-y-1.5">
                  {linkedGuest.inquiries.slice(0, 5).map((inq: any) => (
                    <div key={inq.id} className="flex items-center justify-between text-xs bg-dark-surface2 rounded-lg px-3 py-2">
                      <div className="flex-1 min-w-0">
                        <span className="text-white font-medium truncate block">{inq.subject || inq.inquiry_type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {inq.estimated_value && <span className="text-[#32d74b]">${Number(inq.estimated_value).toLocaleString()}</span>}
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          inq.status === 'won' ? 'bg-green-500/20 text-green-400' :
                          inq.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                          inq.status === 'proposal' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-blue-500/20 text-blue-400'
                        }`}>{inq.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-dark-surface rounded-xl border border-dark-border p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-white">Member Info</h3>
              {!editing && isAdmin && (
                <button onClick={startEditing} className="text-xs text-primary-400 hover:underline flex items-center gap-1">
                  <Pencil size={12} /> Edit
                </button>
              )}
            </div>
            {editing ? (
              <div className="space-y-3">
                <div className="flex flex-col items-center gap-2 mb-2">
                  <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                  <div className="relative cursor-pointer group" onClick={() => avatarInputRef.current?.click()}>
                    {avatarPreview || user?.avatar_url ? (
                      <img
                        src={avatarPreview || (resolveImage(user.avatar_url)!)}
                        alt="Avatar"
                        className="w-20 h-20 rounded-full object-cover border-2 border-dark-border group-hover:opacity-75 transition-opacity"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-full bg-primary-500/20 flex items-center justify-center group-hover:bg-primary-500/30 transition-colors">
                        <span className="text-2xl font-bold text-primary-400">{user?.name?.charAt(0)}</span>
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Camera size={20} className="text-white" />
                    </div>
                  </div>
                  <span className="text-xs text-[#636366]">Click to change photo</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Name</label>
                    <input type="text" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Email</label>
                    <input type="email" value={editForm.email} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Phone</label>
                    <input type="tel" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="+1 234 567 8900" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Nationality</label>
                    <input type="text" value={editForm.nationality} onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Language</label>
                    <input type="text" value={editForm.language} onChange={e => setEditForm(f => ({ ...f, language: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" placeholder="en" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Date of Birth</label>
                    <DatePicker value={editForm.date_of_birth} onChange={v => setEditForm(f => ({ ...f, date_of_birth: v }))} placeholder="Select date of birth" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Tier</label>
                    <select value={editForm.tier_id} onChange={e => setEditForm(f => ({ ...f, tier_id: e.target.value }))} className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                      {(tiersData?.tiers ?? []).map((t: any) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-t-secondary mb-1">Hold this tier until <span className="text-[#636366]">(optional)</span></label>
                    <input
                      type="date"
                      value={editForm.tier_override_until}
                      onChange={e => setEditForm(f => ({ ...f, tier_override_until: e.target.value }))}
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-[#636366]">Tier hold stops the automatic tier sweep from downgrading them before this date. Leave empty for normal tier rules.</p>
                <label className="flex items-center gap-2 text-sm text-[#a0a0a0] cursor-pointer pt-1">
                  <input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} />
                  Active Member
                </label>
                <div className="flex gap-2 pt-3 border-t border-dark-border">
                  <button onClick={() => setEditing(false)} className="flex-1 flex items-center justify-center gap-1.5 border border-dark-border text-[#a0a0a0] py-2 rounded-lg text-sm font-medium hover:bg-dark-surface2 transition-colors">
                    <X size={14} /> Cancel
                  </button>
                  <button onClick={handleSaveEdit} disabled={!editForm.name || !editForm.email || updateMutation.isPending} className="flex-1 flex items-center justify-center gap-1.5 bg-primary-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors">
                    {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div className="flex justify-between"><dt className="text-t-secondary">Phone</dt><dd className="text-white">{user?.phone || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">Nationality</dt><dd className="text-white">{user?.nationality || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">Language</dt><dd className="text-white">{user?.language || '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">Date of Birth</dt><dd className="text-white">{user?.date_of_birth ? new Date(user.date_of_birth).toLocaleDateString() : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">Joined</dt><dd className="text-white">{member?.joined_at ? new Date(member.joined_at).toLocaleDateString() : '—'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">Status</dt><dd className={member?.is_active ? 'text-[#32d74b] font-medium' : 'text-[#ff375f] font-medium'}>{member?.is_active ? 'Active' : 'Inactive'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">NFC Card</dt><dd className={member?.nfc_uid ? 'text-[#32d74b] font-medium' : 'text-[#636366]'}>{member?.nfc_uid ? 'Active' : 'None'}</dd></div>
                <div className="flex justify-between"><dt className="text-t-secondary">Member #</dt><dd className="text-white font-mono">{member?.member_number}</dd></div>
              </dl>
            )}
          </div>

          {/* Danger zone — quiet, isolated, still in Settings tab. */}
          {isAdmin && (
            <div className="bg-dark-surface rounded-xl border border-red-500/20 p-5">
              <h3 className="text-sm font-semibold text-red-300 mb-2">Danger zone</h3>
              <p className="text-xs text-t-secondary mb-4">
                Permanent deletion removes the member, their points history, and all linked data. Cannot be undone.
              </p>
              <button
                onClick={() => {
                  if (confirm(`Permanently delete ${user?.name ?? 'this member'}? All their data will be removed.`)) {
                    deleteMutation.mutate()
                  }
                }}
                disabled={deleteMutation.isPending}
                className="w-full py-2.5 rounded-lg text-sm font-semibold bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 transition-colors flex items-center justify-center gap-2"
              >
                <Trash2 size={14} /> {deleteMutation.isPending ? 'Deleting…' : 'Delete member permanently'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MemberQrCard({ memberId, memberNumber }: { memberId: string; memberNumber?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['member-qr', memberId],
    queryFn: () => api.get(`/v1/admin/members/${memberId}/qr`).then(r => r.data),
    enabled: !!memberId,
  })

  return (
    <div className="bg-dark-surface rounded-xl border border-dark-border p-5 flex flex-col items-center">
      <h3 className="font-semibold text-white mb-3">Member QR Code</h3>
      {isLoading ? (
        <div className="w-40 h-40 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary-400 border-t-transparent" />
        </div>
      ) : data?.qr_image ? (
        <img src={data.qr_image} alt="Member QR" className="w-40 h-40 rounded-lg bg-white p-2" />
      ) : (
        <div className="w-40 h-40 bg-dark-surface2 rounded-lg flex items-center justify-center">
          <span className="text-t-secondary text-xs">QR unavailable</span>
        </div>
      )}
      <p className="text-xs text-t-secondary mt-2 font-mono tracking-wider">{memberNumber ?? data?.member_number}</p>
      {data?.qr_image && (
        <a
          href={data.qr_image}
          download={`member-qr-${memberNumber ?? memberId}.png`}
          className="mt-2 text-xs text-primary-400 hover:underline"
        >
          Download QR
        </a>
      )}
    </div>
  )
}
