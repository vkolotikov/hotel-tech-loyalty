import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Search, ChevronRight, Plus, X, Download, Sparkles, Loader2, Send, Upload, CheckSquare, Square, Users, TrendingUp, Coins, Crown, ArrowUpDown, MessageCircle, Gift } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api, resolveImage } from '../lib/api'
import { triggerExport } from '../lib/crmSettings'
import { Card } from '../components/ui/Card'
import { TierBadge } from '../components/ui/TierBadge'
import { format } from 'date-fns'
import toast from 'react-hot-toast'
import { MembersOnboarding } from '../components/MembersOnboarding'

export function Members() {
  /**
   * First-visit onboarding gate. We check crm_settings for a marker
   * that the admin either applied a preset or explicitly skipped.
   * Until that marker exists, the wizard takes over the page so
   * fresh installs land on a guided setup instead of an empty
   * members table.
   */
  const { data: rawSettings, isLoading: settingsLoading } = useQuery<Record<string, any>>({
    queryKey: ['crm-settings'],
    queryFn: () => api.get('/v1/admin/crm-settings').then(r => r.data),
  })
  const onboardingDone = !!rawSettings?.members_onboarding_completed_at
  const [wizardDismissed, setWizardDismissed] = useState(false)

  // Filters live in the URL so the back button + deep links survive
  // refresh and reload — the staff console gets bookmarked. Search
  // stays local since debouncing into the URL would spam history.
  const [urlParams, setUrlParams] = useSearchParams()
  const tierId       = urlParams.get('tier_id') ?? ''
  const statusFilter = urlParams.get('status') ?? ''
  const sortBy       = urlParams.get('sort_by') ?? 'recent'
  const page         = Number(urlParams.get('page') ?? 1)

  const setUrlParam = (key: string, value: string | undefined, resetPage = true) => {
    setUrlParams(prev => {
      const next = new URLSearchParams(prev)
      if (value === undefined || value === '') next.delete(key)
      else next.set(key, value)
      if (resetPage) next.delete('page')
      return next
    })
  }

  const [search, setSearch] = useState('')
  // debouncedSearch is what hits the API — every keystroke would
  // otherwise hammer /v1/admin/members on orgs with 5k+ members.
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])
  const [showCreate, setShowCreate] = useState(false)
  const [createTab, setCreateTab] = useState<'form' | 'ai'>('form')
  const [form, setForm] = useState({ name: '', email: '', phone: '', tier_id: '' })
  const [captureText, setCaptureText] = useState('')
  const [captureLoading, setCaptureLoading] = useState(false)
  const [captureResult, setCaptureResult] = useState<any>(null)

  // Bulk-select + bulk actions state. selectedIds is reset every page
  // change so the toolbar can't reference rows the user can no longer
  // see; the parent-page checkbox toggles all currently-visible rows.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkMessage, setShowBulkMessage] = useState(false)
  const [bulkMsg, setBulkMsg] = useState({ title: '', body: '', send_email: false, category: 'transactional' as 'offers' | 'points' | 'tier' | 'stays' | 'transactional' })
  const [showImport, setShowImport] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importPreview, setImportPreview] = useState<any>(null)

  // Quick award modal — opened by the hover action on each row.
  // Keeps the staff from leaving the list for a routine +pts adjustment.
  const [quickAward, setQuickAward] = useState<{ id: number; name: string } | null>(null)
  const [quickAwardPts, setQuickAwardPts] = useState('')
  const [quickAwardReason, setQuickAwardReason] = useState('')

  const navigate = useNavigate()
  const qc = useQueryClient()
  const { t } = useTranslation()

  // Gate render: while we don't know yet, show nothing; once we
  // know, either show the wizard or fall through to the real page.
  if (settingsLoading) return null
  if (!onboardingDone && !wizardDismissed) {
    return <MembersOnboarding onComplete={() => setWizardDismissed(true)} />
  }

  const { data: tiersData } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })
  const tiers: { id: number; name: string }[] = tiersData?.tiers ?? []

  // Members header KPI strip + tier-pill counts. Cached for 30s so
  // bouncing between hubs doesn't refetch on every nav.
  const { data: statsData } = useQuery<{
    active_count: number; total_count: number; new_this_month: number; avg_points: number;
    top_tier_pct: number; top_tier_name: string | null;
    tier_breakdown: { id: number; name: string; color_hex: string | null; count: number }[]
  }>({
    queryKey: ['admin-members-stats'],
    queryFn: () => api.get('/v1/admin/members/stats').then(r => r.data),
    staleTime: 30_000,
  })
  const tierBreakdown = statsData?.tier_breakdown ?? []

  const { data, isLoading } = useQuery({
    queryKey: ['admin-members', debouncedSearch, tierId, statusFilter, sortBy, page],
    queryFn: () => api.get('/v1/admin/members', {
      params: {
        search: debouncedSearch,
        tier_id: tierId || undefined,
        is_active: statusFilter !== '' ? statusFilter : undefined,
        sort_by: sortBy,
        page,
      },
    }).then(r => r.data),
  })

  // Reset selection whenever the visible page changes — selectedIds
  // referring to off-page rows would silently get included in bulk
  // actions, which is surprising and dangerous.
  useEffect(() => { setSelectedIds(new Set()) }, [page, debouncedSearch, tierId, statusFilter, sortBy])

  const visibleRows: any[] = (data as any)?.data ?? []
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every(m => selectedIds.has(m.id))

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        visibleRows.forEach(m => next.delete(m.id))
      } else {
        visibleRows.forEach(m => next.add(m.id))
      }
      return next
    })
  }

  const bulkMessageMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/members/bulk-message', {
      member_ids: Array.from(selectedIds),
      title: bulkMsg.title,
      body: bulkMsg.body,
      send_email: bulkMsg.send_email,
      category: bulkMsg.category,
    }).then(r => r.data),
    onSuccess: (res: any) => {
      toast.success(`Sent — push: ${res.push_sent}, email: ${res.email_sent}, skipped: ${res.skipped}`)
      setShowBulkMessage(false)
      setBulkMsg({ title: '', body: '', send_email: false, category: 'transactional' })
      setSelectedIds(new Set())
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not send broadcast'),
  })

  const importPreviewMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', importFile as File)
      fd.append('dry_run', '1')
      return api.post('/v1/admin/members/bulk-import', fd).then(r => r.data)
    },
    onSuccess: (res: any) => setImportPreview(res),
    onError: (e: any) => toast.error(e.response?.data?.message || 'Could not parse CSV'),
  })
  const importCommitMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData()
      fd.append('file', importFile as File)
      return api.post('/v1/admin/members/bulk-import', fd).then(r => r.data)
    },
    onSuccess: (res: any) => {
      toast.success(`Imported ${res.ok} members (skipped ${res.skip}, errors ${res.error})`)
      qc.invalidateQueries({ queryKey: ['admin-members'] })
      setShowImport(false)
      setImportFile(null)
      setImportPreview(null)
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Import failed'),
  })

  const downloadCsvTemplate = () => {
    const csv = 'name,email,phone,tier_name\nJohn Smith,john@example.com,+15551234567,Bronze\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'members-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const quickAwardMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/points/award', {
      member_id: quickAward?.id,
      points: Number(quickAwardPts),
      description: quickAwardReason || 'Staff courtesy',
    }).then(r => r.data),
    onSuccess: () => {
      toast.success(`${quickAwardPts} pts awarded to ${quickAward?.name}`)
      qc.invalidateQueries({ queryKey: ['admin-members'] })
      qc.invalidateQueries({ queryKey: ['admin-members-stats'] })
      setQuickAward(null); setQuickAwardPts(''); setQuickAwardReason('')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Award failed'),
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/v1/admin/members', {
      name: form.name,
      email: form.email,
      phone: form.phone || undefined,
      tier_id: form.tier_id || undefined,
      send_welcome_email: true,
    }).then(r => r.data),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ['admin-members'] })
      toast.success(data?.message ?? 'Member created — welcome email sent.')
      setShowCreate(false)
      setForm({ name: '', email: '', phone: '', tier_id: '' })
    },
    onError: (e: any) => {
      const errors = e.response?.data?.errors
      if (errors) {
        const first = Object.values(errors)[0] as string[]
        toast.error(first[0])
      } else {
        toast.error(e.response?.data?.message || 'Failed to create member')
      }
    },
  })

  const kpis = [
    {
      key: 'active',
      label: t('members.kpis.active_members', 'Active members'),
      value: statsData ? `${statsData.active_count} / ${statsData.total_count}` : '—',
      icon: Users,
      tint: 'text-blue-400',
    },
    {
      key: 'new',
      label: t('members.kpis.new_this_month', 'New this month'),
      value: statsData?.new_this_month ?? '—',
      icon: TrendingUp,
      tint: 'text-emerald-400',
    },
    {
      key: 'avg',
      label: t('members.kpis.avg_points', 'Avg points'),
      value: statsData ? statsData.avg_points.toLocaleString() : '—',
      icon: Coins,
      tint: 'text-amber-400',
    },
    {
      key: 'top',
      label: statsData?.top_tier_name
        ? t('members.kpis.in_tier', { tier: statsData.top_tier_name, defaultValue: 'In {{tier}}' })
        : t('members.kpis.top_tier', 'Top tier'),
      value: statsData ? `${statsData.top_tier_pct}%` : '—',
      icon: Crown,
      tint: 'text-purple-400',
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('members.title', 'Members')}</h1>
          <p className="text-sm text-t-secondary mt-0.5">{t('members.total', { count: (data as any)?.total ?? 0, defaultValue: '{{count}} total members' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
          >
            <Upload size={16} />
            {t('members.actions.import_csv', 'Import CSV')}
          </button>
          <button
            onClick={() => triggerExport('/v1/admin/members/export', { search, tier_id: tierId || undefined })}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-dark-surface border border-dark-border text-[#e0e0e0] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors"
          >
            <Download size={16} />
            {t('members.actions.export', 'Export')}
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 transition-colors"
          >
            <Plus size={16} />
            {t('members.actions.add_member', 'Add Member')}
          </button>
        </div>
      </div>

      {/* KPI strip — at-a-glance health for the loyalty program */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {kpis.map(k => (
          <div key={k.key} className="bg-dark-surface rounded-xl border border-dark-border px-4 py-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg bg-dark-surface2 flex items-center justify-center ${k.tint}`}>
              <k.icon size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] uppercase tracking-wide text-t-secondary truncate">{k.label}</p>
              <p className="text-lg font-bold text-white truncate">{k.value}</p>
            </div>
          </div>
        ))}
      </div>

      <Card>
        {/* Search row + sort */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366]" />
            <input
              type="text"
              placeholder={t('members.search_placeholder', 'Search by name, email, or member number…')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setUrlParam('page', undefined) }}
              className="w-full pl-9 pr-4 py-2 bg-[#1e1e1e] border border-dark-border rounded-lg text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="relative">
            <ArrowUpDown size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#636366] pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => setUrlParam('sort_by', e.target.value === 'recent' ? undefined : e.target.value)}
              className="appearance-none bg-[#1e1e1e] border border-dark-border rounded-lg pl-8 pr-8 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="recent">{t('members.sort.recent', 'Recently joined')}</option>
              <option value="points">{t('members.sort.points', 'Points high → low')}</option>
              <option value="name">{t('members.sort.name', 'Name A → Z')}</option>
              <option value="last_activity">{t('members.sort.last_activity', 'Last activity')}</option>
            </select>
          </div>
        </div>

        {/* Tier pills + status segmented toggle */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setUrlParam('tier_id', undefined)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tierId === ''
                  ? 'bg-primary-500/15 text-primary-300 border border-primary-500/40'
                  : 'bg-dark-surface2 text-t-secondary border border-dark-border hover:text-white'
              }`}
            >
              {t('members.filters.all_tiers', 'All tiers')}
              <span className="text-[10px] text-t-secondary font-normal">{statsData?.total_count ?? '—'}</span>
            </button>
            {tierBreakdown.map(t => {
              const active = String(tierId) === String(t.id)
              const dot = t.color_hex || '#c9a84c'
              return (
                <button
                  key={t.id}
                  onClick={() => setUrlParam('tier_id', active ? undefined : String(t.id))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                    active
                      ? 'bg-white/10 text-white border-white/30'
                      : 'bg-dark-surface2 text-t-secondary border-dark-border hover:text-white'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dot }} />
                  {t.name}
                  <span className="text-[10px] text-t-secondary font-normal">{t.count}</span>
                </button>
              )
            })}
          </div>

          <div className="inline-flex bg-dark-surface2 border border-dark-border rounded-lg p-0.5 self-start lg:self-auto">
            {[
              { val: '',  label: t('members.filters.all',      'All') },
              { val: '1', label: t('members.filters.active',   'Active') },
              { val: '0', label: t('members.filters.inactive', 'Inactive') },
            ].map(opt => (
              <button
                key={opt.val}
                onClick={() => setUrlParam('status', opt.val || undefined)}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors ${
                  statusFilter === opt.val ? 'bg-primary-500/20 text-primary-300' : 'text-t-secondary hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile card list (≤md) */}
        <div className="md:hidden space-y-2">
          {isLoading ? (
            Array(6).fill(0).map((_, i) => (
              <div key={i} className="bg-[#1a1a1a] border border-dark-border rounded-xl p-3 animate-pulse">
                <div className="h-4 bg-dark-surface2 rounded w-32 mb-2" />
                <div className="h-3 bg-dark-surface2 rounded w-24" />
              </div>
            ))
          ) : (data as any)?.data?.length === 0 ? (
            <p className="text-center text-[#636366] py-8 text-sm">
              {t('members.empty.no_members', 'No members yet.')} {search && t('members.empty.try_different_search', 'Try a different search term.')}
            </p>
          ) : (
            ((data as any)?.data ?? []).map((m: any) => (
              <div
                key={m.id}
                onClick={() => navigate(`/members/${m.id}`)}
                className="bg-[#1a1a1a] border border-dark-border rounded-xl p-3 active:bg-dark-surface2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  {m.user?.avatar_url ? (
                    <img
                      src={resolveImage(m.user.avatar_url)!}
                      alt={m.user.name}
                      className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-primary-400">{m.user?.name?.charAt(0)}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{m.user?.name}</p>
                    <p className="text-xs text-[#636366] truncate">{m.user?.email}</p>
                  </div>
                  <ChevronRight size={16} className="text-[#636366] flex-shrink-0" />
                </div>
                <div className="flex items-center gap-2 mt-3 flex-wrap">
                  <TierBadge tier={m.tier?.name} color={m.tier?.color_hex} />
                  <span className="text-xs font-semibold text-white">{m.current_points?.toLocaleString()} pts</span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium ml-auto ${m.is_active ? 'bg-[#32d74b]/15 text-[#32d74b]' : 'bg-dark-surface3 text-[#636366]'}`}>
                    {m.is_active ? t('members.filters.active', 'Active') : t('members.filters.inactive', 'Inactive')}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop table (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-t-secondary border-b border-dark-border">
                <th className="pb-3 w-8">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelectAll() }}
                    className="text-t-secondary hover:text-white"
                    title={allVisibleSelected ? t('members.deselect_page', 'Deselect page') : t('members.select_page', 'Select page')}
                  >
                    {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                  </button>
                </th>
                <th className="pb-3 font-medium">{t('members.table.member',  'Member')}</th>
                <th className="pb-3 font-medium">{t('members.table.phone',   'Phone')}</th>
                <th className="pb-3 font-medium">{t('members.table.source',  'Source')}</th>
                <th className="pb-3 font-medium">{t('members.table.tier',    'Tier')}</th>
                <th className="pb-3 font-medium">{t('members.table.points',  'Points')}</th>
                <th className="pb-3 font-medium">{t('members.table.joined',  'Joined')}</th>
                <th className="pb-3 font-medium">{t('members.table.status',  'Status')}</th>
                <th className="pb-3 text-right pr-2">{t('members.table.actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-border">
              {isLoading ? (
                Array(10).fill(0).map((_, i) => (
                  <tr key={i}>
                    {Array(8).fill(0).map((_, j) => (
                      <td key={j} className="py-3"><div className="h-4 bg-dark-surface2 rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : (data as any)?.data?.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-[#636366]">
                    No members yet. {search && 'Try a different search term.'}
                  </td>
                </tr>
              ) : (
                ((data as any)?.data ?? []).map((m: any) => (
                  <tr key={m.id} className="group hover:bg-dark-surface2 cursor-pointer transition-colors" onClick={() => navigate(`/members/${m.id}`)}>
                    <td className="py-3 w-8" onClick={(e) => { e.stopPropagation(); toggleSelect(m.id) }}>
                      <button className="text-t-secondary hover:text-white">
                        {selectedIds.has(m.id) ? <CheckSquare size={16} className="text-primary-400" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        {m.user?.avatar_url ? (
                          <img
                            src={resolveImage(m.user.avatar_url)!}
                            alt={m.user.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-xs font-bold text-primary-400">{m.user?.name?.charAt(0)}</span>
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{m.user?.name}</p>
                          <p className="text-xs text-[#636366]">{m.user?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 text-xs text-[#a0a0a0]">{m.user?.phone || m.guests?.[0]?.phone || m.guests?.[0]?.mobile || '—'}</td>
                    <td className="py-3 text-xs">
                      {m.guests?.[0]?.lead_source ? (
                        <span className="inline-flex px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-medium">
                          {m.guests[0].lead_source}
                        </span>
                      ) : <span className="text-[#636366]">—</span>}
                    </td>
                    <td className="py-3"><TierBadge tier={m.tier?.name} color={m.tier?.color_hex} /></td>
                    <td className="py-3 font-semibold text-white">{m.current_points?.toLocaleString()}</td>
                    <td className="py-3 text-t-secondary text-xs">{m.joined_at ? format(new Date(m.joined_at), 'MMM d, yyyy') : '—'}</td>
                    <td className="py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${m.is_active ? 'bg-[#32d74b]/15 text-[#32d74b]' : 'bg-dark-surface3 text-[#636366]'}`}>
                        {m.is_active ? t('members.filters.active', 'Active') : t('members.filters.inactive', 'Inactive')}
                      </span>
                    </td>
                    <td className="py-3 pr-2">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          title={t('members.actions.award_points', 'Award points')}
                          onClick={(e) => { e.stopPropagation(); setQuickAward({ id: m.id, name: m.user?.name ?? 'this member' }) }}
                          className="p-1.5 rounded-md text-emerald-400 hover:bg-emerald-500/15 transition-colors"
                        >
                          <Gift size={14} />
                        </button>
                        <button
                          title={t('members.actions.send_message', 'Send message')}
                          onClick={(e) => {
                            e.stopPropagation()
                            setSelectedIds(new Set([m.id]))
                            setShowBulkMessage(true)
                          }}
                          className="p-1.5 rounded-md text-primary-400 hover:bg-primary-500/15 transition-colors"
                        >
                          <MessageCircle size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {(data as any)?.last_page > 1 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-dark-border">
            <p className="text-sm text-t-secondary">
              Showing {(data as any).from ?? 0}–{(data as any).to ?? 0} of {(data as any).total} members
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setUrlParam('page', String(Math.max(1, page - 1)), false)}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setUrlParam('page', String(page + 1), false)}
                disabled={page >= ((data as any).last_page ?? 1)}
                className="px-3 py-1.5 text-sm border border-dark-border text-[#a0a0a0] rounded-lg disabled:opacity-50 hover:bg-dark-surface2 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Add Member Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-dark-border">
              <h2 className="text-lg font-bold text-white">Add New Member</h2>
              <button onClick={() => { setShowCreate(false); setCaptureResult(null); setCaptureText(''); setCreateTab('form') }} className="text-[#636366] hover:text-white">
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-dark-border">
              <button onClick={() => setCreateTab('form')} className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${createTab === 'form' ? 'text-primary-400 border-b-2 border-primary-400' : 'text-t-secondary hover:text-white'}`}>
                <Plus size={14} className="inline mr-1.5 -mt-0.5" />Manual Entry
              </button>
              <button onClick={() => setCreateTab('ai')} className={`flex-1 py-2.5 text-sm font-medium text-center transition-colors ${createTab === 'ai' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-t-secondary hover:text-white'}`}>
                <Sparkles size={14} className="inline mr-1.5 -mt-0.5" />AI Capture
              </button>
            </div>

            {createTab === 'form' ? (
              <>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Full Name *</label>
                      <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="John Smith"
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Email Address *</label>
                      <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="john@example.com"
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div className="rounded-lg border border-primary-500/30 bg-primary-500/5 px-3 py-2.5 text-xs text-[#a0a0a0]">
                      <span className="font-semibold text-primary-400">Password:</span> the member will receive a welcome email with a 6-digit code to set their own password. No password needed from you.
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Phone <span className="font-normal text-[#636366]">(optional)</span></label>
                      <input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+1 234 567 8900"
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500" />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-[#a0a0a0] mb-1">Starting Tier <span className="font-normal text-[#636366]">(optional, default Bronze)</span></label>
                      <select value={form.tier_id} onChange={e => setForm(f => ({ ...f, tier_id: e.target.value }))}
                        className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                        <option value="">Default tier</option>
                        {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    </div>
                  </div>
                  <p className="text-xs text-[#636366]">Member will receive 500 welcome bonus points automatically.</p>
                </div>
                <div className="flex gap-3 p-6 border-t border-dark-border">
                  <button onClick={() => setShowCreate(false)}
                    className="flex-1 border border-dark-border text-[#a0a0a0] py-2.5 rounded-lg text-sm font-semibold hover:bg-dark-surface2 transition-colors">Cancel</button>
                  <button onClick={() => createMutation.mutate()} disabled={!form.name || !form.email || createMutation.isPending}
                    className="flex-1 bg-primary-600 text-white py-2.5 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
                    {createMutation.isPending ? 'Creating...' : 'Create Member'}
                  </button>
                </div>
              </>
            ) : (
              <div className="p-6">
                {!captureResult ? (
                  <div className="space-y-3">
                    <p className="text-xs text-t-secondary">Paste an email, registration form, business card text, or any message. AI will extract member details automatically.</p>
                    <textarea value={captureText} onChange={e => setCaptureText(e.target.value)} rows={8}
                      placeholder="e.g. Hi, I'd like to sign up for the loyalty program. My name is Sarah Johnson, email sarah.j@acme.com, phone +971 50 123 4567. I'm a British national and I travel frequently for business..."
                      className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none" />
                    <div className="flex justify-end gap-3">
                      <button type="button" onClick={() => { setShowCreate(false); setCaptureText('') }} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                      <button
                        onClick={async () => {
                          if (!captureText.trim()) return
                          setCaptureLoading(true)
                          try {
                            const res = await api.post('/v1/admin/crm-ai/capture-member', { text: captureText })
                            if (res.data.success) {
                              setCaptureResult(res.data.data)
                            } else {
                              toast.error(res.data.error || 'Failed to extract data')
                            }
                          } catch (e: any) {
                            toast.error(e.response?.data?.message || 'AI extraction failed')
                          } finally { setCaptureLoading(false) }
                        }}
                        disabled={captureLoading || !captureText.trim()}
                        className="flex items-center gap-2 px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white font-semibold text-sm rounded-lg disabled:opacity-50 transition-colors"
                      >
                        {captureLoading ? <><Loader2 size={14} className="animate-spin" /> Extracting...</> : <><Sparkles size={14} /> Extract</>}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="bg-purple-500/5 border border-purple-500/20 rounded-lg p-3 text-xs text-purple-300">
                      AI extracted the following. Review and edit before creating the member.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { key: 'name', label: 'Full Name', type: 'text' },
                        { key: 'email', label: 'Email', type: 'email' },
                        { key: 'phone', label: 'Phone', type: 'text' },
                        { key: 'nationality', label: 'Nationality', type: 'text' },
                        { key: 'language', label: 'Language', type: 'text' },
                      ].map(({ key, label, type }) => (
                        <div key={key}>
                          <label className="block text-xs text-[#a0a0a0] mb-1">{label}</label>
                          <input type={type} value={captureResult[key] ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, [key]: e.target.value }))}
                            className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-[#a0a0a0] mb-1">Starting Tier</label>
                        <select value={tiers.find(t => t.name === captureResult.tier)?.id ?? ''} onChange={e => setCaptureResult((r: any) => ({ ...r, tier_id: e.target.value, tier: tiers.find(t => t.id === Number(e.target.value))?.name ?? '' }))}
                          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                          <option value="">Default tier</option>
                          {tiers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </div>
                    </div>
                    {captureResult.notes && (
                      <div>
                        <label className="block text-xs text-[#a0a0a0] mb-1">AI Notes</label>
                        <p className="text-xs text-t-secondary bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2">{captureResult.notes}</p>
                      </div>
                    )}
                    <div className="flex justify-between pt-1">
                      <button onClick={() => setCaptureResult(null)} className="text-sm text-[#636366] hover:text-white">Back</button>
                      <div className="flex gap-3">
                        <button onClick={() => { setShowCreate(false); setCaptureResult(null); setCaptureText('') }} className="px-4 py-2 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
                        <button
                          onClick={async () => {
                            const r = captureResult
                            try {
                              const resp = await api.post('/v1/admin/members', {
                                name: r.name,
                                email: r.email,
                                phone: r.phone || undefined,
                                tier_id: r.tier_id || tiers.find(t => t.name === r.tier)?.id || undefined,
                                send_welcome_email: true,
                              })
                              qc.invalidateQueries({ queryKey: ['admin-members'] })
                              toast.success(resp.data?.message ?? `Member created for ${r.name}`)
                              setShowCreate(false); setCaptureResult(null); setCaptureText('')
                            } catch (e: any) {
                              const errors = e.response?.data?.errors
                              if (errors) { toast.error((Object.values(errors)[0] as string[])[0]) }
                              else { toast.error(e.response?.data?.message || 'Failed to create member') }
                            }
                          }}
                          disabled={!captureResult.name || !captureResult.email}
                          className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
                        >
                          Create Member
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating bulk action bar — slides in from bottom when any row
          is selected. Counts the union across pages so an admin
          selecting Page 1 + paging to Page 2 + selecting more still
          sees the running total. */}
      {selectedIds.size > 0 && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6 z-40 bg-dark-surface border border-primary-500/50 rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-sm text-white font-medium">{selectedIds.size} selected</span>
          <button
            onClick={() => setShowBulkMessage(true)}
            className="flex items-center gap-1.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-3 py-1.5 rounded-lg transition-colors"
          >
            <Send size={14} /> Send message
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-t-secondary hover:text-white text-sm"
          >
            Clear
          </button>
        </div>
      )}

      {/* Quick award modal — inline +pts without leaving the list */}
      {quickAward && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-dark-border">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center text-emerald-400">
                  <Gift size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-white">Award points</p>
                  <p className="text-[11px] text-t-secondary truncate">to {quickAward.name}</p>
                </div>
              </div>
              <button onClick={() => { setQuickAward(null); setQuickAwardPts(''); setQuickAwardReason('') }} className="text-[#636366] hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <input
                type="number"
                autoFocus
                placeholder="100"
                value={quickAwardPts}
                onChange={e => setQuickAwardPts(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2.5 text-2xl font-bold text-emerald-400 text-center focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <div className="flex flex-wrap gap-1.5">
                {[100, 250, 500, 1000].map(n => (
                  <button
                    key={n}
                    onClick={() => setQuickAwardPts(String(n))}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-dark-surface2 hover:bg-dark-surface3 text-[#a0a0a0] hover:text-white transition-colors"
                  >
                    +{n}
                  </button>
                ))}
              </div>
              <input
                type="text"
                placeholder="Reason (e.g. Staff courtesy)"
                value={quickAwardReason}
                onChange={e => setQuickAwardReason(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-dark-border">
              <button onClick={() => { setQuickAward(null); setQuickAwardPts(''); setQuickAwardReason('') }} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
              <button
                onClick={() => quickAwardMutation.mutate()}
                disabled={!quickAwardPts || quickAwardMutation.isPending}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
              >
                {quickAwardMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Gift size={14} />}
                Award
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk message modal */}
      {showBulkMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-dark-border">
              <h2 className="text-base font-bold text-white">Send to {selectedIds.size} members</h2>
              <button onClick={() => setShowBulkMessage(false)} className="text-[#636366] hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">Category</label>
                <select
                  value={bulkMsg.category}
                  onChange={e => setBulkMsg(m => ({ ...m, category: e.target.value as any }))}
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white"
                >
                  <option value="transactional">Transactional (always delivered)</option>
                  <option value="offers">Offers</option>
                  <option value="points">Points</option>
                  <option value="tier">Tier</option>
                  <option value="stays">Stays</option>
                </select>
                <p className="text-[11px] text-[#636366] mt-1">Members who opted out of this category will be skipped (transactional ignores opt-outs).</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">Title</label>
                <input
                  type="text"
                  value={bulkMsg.title}
                  onChange={e => setBulkMsg(m => ({ ...m, title: e.target.value }))}
                  maxLength={120}
                  placeholder="A surprise for our Gold members"
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#a0a0a0] mb-1">Message</label>
                <textarea
                  value={bulkMsg.body}
                  onChange={e => setBulkMsg(m => ({ ...m, body: e.target.value }))}
                  maxLength={500}
                  rows={4}
                  placeholder="Double points this weekend on every stay."
                  className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366]"
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-[#e0e0e0] cursor-pointer">
                <input
                  type="checkbox"
                  checked={bulkMsg.send_email}
                  onChange={e => setBulkMsg(m => ({ ...m, send_email: e.target.checked }))}
                />
                Also send as email
              </label>
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-dark-border">
              <button onClick={() => setShowBulkMessage(false)} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
              <button
                onClick={() => bulkMessageMutation.mutate()}
                disabled={bulkMessageMutation.isPending || !bulkMsg.title.trim() || !bulkMsg.body.trim()}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
              >
                {bulkMessageMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                Send to {selectedIds.size}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV import modal — dry-run preview then commit */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-surface rounded-2xl border border-dark-border w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-dark-border">
              <h2 className="text-base font-bold text-white">Bulk import members</h2>
              <button onClick={() => { setShowImport(false); setImportFile(null); setImportPreview(null) }} className="text-[#636366] hover:text-white"><X size={20} /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-[#a0a0a0]">
                Upload a CSV with columns <code>name, email, phone, tier_name</code>. Up to 500 rows per import.
                Duplicates by email are skipped automatically.
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadCsvTemplate}
                  className="flex items-center gap-1.5 bg-dark-surface2 border border-dark-border text-[#e0e0e0] px-3 py-1.5 rounded-lg text-xs font-medium"
                >
                  <Download size={12} /> Template
                </button>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setImportPreview(null) }}
                  className="text-xs text-[#a0a0a0]"
                />
              </div>
              {importPreview && (
                <div className="rounded-lg border border-dark-border bg-[#1a1a1a] p-3">
                  <div className="flex gap-4 text-xs mb-2">
                    <span className="text-emerald-400 font-semibold">OK: {importPreview.ok}</span>
                    <span className="text-amber-400 font-semibold">Skip: {importPreview.skip}</span>
                    <span className="text-red-400 font-semibold">Error: {importPreview.error}</span>
                    <span className="text-[#636366]">/ {importPreview.total} rows</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto text-[11px] font-mono">
                    {importPreview.rows?.slice(0, 50).map((r: any) => (
                      <div key={r.line} className={`flex gap-2 py-0.5 ${r.status === 'error' ? 'text-red-400' : r.status === 'skip' ? 'text-amber-400' : 'text-emerald-400'}`}>
                        <span className="text-[#636366] w-10">L{r.line}</span>
                        <span className="w-12 uppercase">{r.status}</span>
                        <span className="flex-1 truncate">{r.email}</span>
                        {r.reason && <span className="text-[#a0a0a0] truncate">{r.reason}</span>}
                      </div>
                    ))}
                    {importPreview.rows?.length > 50 && (
                      <div className="text-[#636366] pt-2">+ {importPreview.rows.length - 50} more rows…</div>
                    )}
                  </div>
                  {importPreview.plan_limit?.limit && (
                    <p className="text-[11px] text-[#a0a0a0] mt-2">
                      Plan cap: currently using {importPreview.plan_limit.count} of {importPreview.plan_limit.limit} loyalty-member slots.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-dark-border">
              <button onClick={() => { setShowImport(false); setImportFile(null); setImportPreview(null) }} className="px-3 py-1.5 text-sm text-[#a0a0a0] hover:text-white">Cancel</button>
              <button
                onClick={() => importPreviewMutation.mutate()}
                disabled={!importFile || importPreviewMutation.isPending}
                className="flex items-center gap-2 bg-dark-surface2 border border-dark-border text-white text-sm font-semibold px-3 py-1.5 rounded-lg disabled:opacity-50"
              >
                {importPreviewMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                Preview
              </button>
              <button
                onClick={() => importCommitMutation.mutate()}
                disabled={!importPreview || importPreview.ok === 0 || importCommitMutation.isPending}
                className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-1.5 rounded-lg"
              >
                {importCommitMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Import {importPreview ? importPreview.ok : ''}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
