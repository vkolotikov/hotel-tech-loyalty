import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import {
  Save, RefreshCw, RotateCcw, Upload, ExternalLink, Palette, Settings2,
  Bell, Brain, Cloud, Smartphone, Database, Shield, Calendar,
  Mail, Wifi, CheckCircle, XCircle, Eye, EyeOff,
  Zap, Globe, Users, Star, Layers
} from 'lucide-react'
import toast from 'react-hot-toast'

/* ─── Constants ────────────────────────────────────────────────────────── */

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32', Silver: '#C0C0C0', Gold: '#FFD700',
  Platinum: '#6B6B6B', Diamond: '#00BCD4',
}

const COLOR_KEYS = [
  'primary_color', 'secondary_color', 'accent_color',
  'background_color', 'surface_color', 'text_color',
  'text_secondary_color', 'border_color',
  'error_color', 'warning_color', 'info_color',
]

const SECRET_KEYS = [
  'ai_openai_api_key', 'ai_anthropic_api_key',
  'booking_smoobu_api_key', 'booking_smoobu_webhook_secret',
  'mail_password', 'expo_access_token',
]

const PRESETS: Record<string, Record<string, string>> = {
  'Gold Luxury': {
    primary_color: '#c9a84c', secondary_color: '#1e1e1e', accent_color: '#32d74b',
    background_color: '#0d0d0d', surface_color: '#161616', text_color: '#ffffff',
    text_secondary_color: '#8e8e93', border_color: '#2c2c2c',
    error_color: '#ff375f', warning_color: '#ffd60a', info_color: '#0a84ff',
  },
  'Royal Blue': {
    primary_color: '#3b82f6', secondary_color: '#1e293b', accent_color: '#22c55e',
    background_color: '#0f172a', surface_color: '#1e293b', text_color: '#f8fafc',
    text_secondary_color: '#94a3b8', border_color: '#334155',
    error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4',
  },
  'Emerald Resort': {
    primary_color: '#10b981', secondary_color: '#1a2332', accent_color: '#f59e0b',
    background_color: '#0c1117', surface_color: '#141e29', text_color: '#f0fdf4',
    text_secondary_color: '#86efac', border_color: '#1e3a2f',
    error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#38bdf8',
  },
  'Rose Boutique': {
    primary_color: '#e11d48', secondary_color: '#1c1017', accent_color: '#fb923c',
    background_color: '#0f0708', surface_color: '#1c1017', text_color: '#fff1f2',
    text_secondary_color: '#fda4af', border_color: '#3b1524',
    error_color: '#dc2626', warning_color: '#facc15', info_color: '#60a5fa',
  },
  'Ocean Breeze': {
    primary_color: '#06b6d4', secondary_color: '#0f2937', accent_color: '#a78bfa',
    background_color: '#0a1a24', surface_color: '#0f2937', text_color: '#ecfeff',
    text_secondary_color: '#67e8f9', border_color: '#164e63',
    error_color: '#fb7185', warning_color: '#fde047', info_color: '#818cf8',
  },
  'Midnight Purple': {
    primary_color: '#8b5cf6', secondary_color: '#1a1625', accent_color: '#f472b6',
    background_color: '#0e0b16', surface_color: '#1a1625', text_color: '#f5f3ff',
    text_secondary_color: '#a78bfa', border_color: '#2e1f4d',
    error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#22d3ee',
  },
}

/* ─── Tab Config ────────────────────────────────────────────────────────── */

interface Tab {
  id: string
  label: string
  icon: any
  desc: string
  groups?: string[]       // which setting groups this tab shows
  custom?: boolean        // has custom rendering
}

const TABS: Tab[] = [
  { id: 'general',       label: 'General',        icon: Settings2,  desc: 'Company info, account & system',       groups: ['general'],      custom: true },
  { id: 'branding',      label: 'Branding',        icon: Palette,    desc: 'Colors, logo, theme presets',          groups: ['appearance'],   custom: true },
  { id: 'loyalty',       label: 'Loyalty',         icon: Star,       desc: 'Points, tiers & rewards',              groups: ['points'],       custom: true },
  { id: 'notifications', label: 'Notifications',   icon: Bell,       desc: 'Push & email notification config',     groups: ['notifications'] },
  { id: 'integrations',  label: 'Integrations',    icon: Zap,        desc: 'API keys, AI models, PMS & SMTP',      groups: ['integrations'], custom: true },
  { id: 'booking',       label: 'Booking',         icon: Calendar,   desc: 'Booking engine configuration',         groups: ['booking'],      custom: true },
  { id: 'system',        label: 'System',          icon: Shield,     desc: 'System info & quick links',            custom: true },
]

/* ─── Component ─────────────────────────────────────────────────────────── */

export function Settings() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({})
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  /* ── Queries ─────────────────────────────────────────────────────────── */

  const { data: tiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
  })

  /* ── Mutations ───────────────────────────────────────────────────────── */

  const saveMutation = useMutation({
    mutationFn: (settings: { key: string; value: any }[]) =>
      api.put('/v1/admin/settings', { settings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['admin-theme'] })
      setEditedSettings({})
      toast.success('Settings saved')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('logo', file)
      return api.post('/v1/admin/settings/logo', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['settings-logo'] })
      setLogoPreview(null)
      toast.success('Logo uploaded')
    },
    onError: () => toast.error('Logo upload failed'),
  })

  /* ── Handlers ────────────────────────────────────────────────────────── */

  const allSettings = settingsData?.settings ?? {}

  const getVal = (key: string): string => {
    if (editedSettings[key] !== undefined) return editedSettings[key]
    for (const group of Object.values(allSettings)) {
      const found = (group as any[]).find((s: any) => s.key === key)
      if (found) return String(found.value ?? '')
    }
    return ''
  }

  const handleChange = (key: string, value: string) => {
    setEditedSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const settings = Object.entries(editedSettings).map(([key, value]) => ({ key, value }))
    if (settings.length > 0) saveMutation.mutate(settings)
  }

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
      logoMutation.mutate(file)
    }
  }

  const applyPreset = (name: string) => {
    const p = PRESETS[name]
    if (!p) return
    setEditedSettings(prev => ({ ...prev, ...p }))
    toast.success(`Applied "${name}" — Save to apply`)
  }

  const toggleReveal = (key: string) => {
    setRevealedSecrets(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const testConnection = async (type: string) => {
    setTestingIntegration(type)
    try {
      const { data } = await api.post('/v1/admin/settings/test-integration', { type })
      setTestResults(prev => ({ ...prev, [type]: data }))
      data.success ? toast.success(`${type}: ${data.message}`) : toast.error(`${type}: ${data.message}`)
    } catch {
      setTestResults(prev => ({ ...prev, [type]: { success: false, message: 'Request failed' } }))
      toast.error(`${type}: connection test failed`)
    }
    setTestingIntegration(null)
  }

  const hasChanges = Object.keys(editedSettings).length > 0

  // Get settings for a group
  const groupSettings = (groupName: string): any[] => allSettings[groupName] ?? []

  // Get settings for the current tab
  const tabSettings = useMemo(() => {
    const tab = TABS.find(t => t.id === activeTab)
    if (!tab?.groups) return []
    return tab.groups.flatMap(g => groupSettings(g))
  }, [activeTab, allSettings])

  const currentLogoUrl = resolveImage(getVal('company_logo') || null)

  /* ── Shared UI ───────────────────────────────────────────────────────── */

  const cardClass = 'rounded-2xl border border-white/[0.06] p-6'
  const cardStyle = { background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))', boxShadow: '0 16px 30px rgba(0,0,0,0.18)' }
  const inputClass = 'w-full bg-[#0f1c18] border border-white/[0.08] rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-emerald-500/40'
  const btnPrimary = 'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all'

  /* ── Setting Field Renderer ──────────────────────────────────────────── */

  const renderField = (setting: any) => {
    const isColor = COLOR_KEYS.includes(setting.key)
    const isSecret = SECRET_KEYS.includes(setting.key)
    const currentVal = editedSettings[setting.key] ?? String(setting.value ?? '')
    const revealed = revealedSecrets.has(setting.key)

    if (isColor) {
      return (
        <div className="flex items-center gap-2">
          <input type="color" value={currentVal || '#000000'}
            onChange={e => handleChange(setting.key, e.target.value)}
            className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
          <input type="text" value={currentVal}
            onChange={e => handleChange(setting.key, e.target.value)}
            placeholder="#000000" maxLength={7}
            className={inputClass + ' flex-1 font-mono'} />
        </div>
      )
    }

    if (setting.type === 'boolean') {
      const isOn = currentVal === 'true' || currentVal === '1'
      return (
        <button onClick={() => handleChange(setting.key, isOn ? 'false' : 'true')}
          className={`relative w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}>
          <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${isOn ? 'translate-x-6' : 'translate-x-0.5'}`} />
        </button>
      )
    }

    if (setting.type === 'integer') {
      return <input type="number" value={currentVal} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass} />
    }

    if (setting.type === 'json') {
      return <textarea value={currentVal} onChange={e => handleChange(setting.key, e.target.value)}
        rows={3} className={inputClass + ' font-mono text-xs'} />
    }

    if (isSecret) {
      return (
        <div className="relative">
          <input
            type={revealed ? 'text' : 'password'}
            value={currentVal}
            onChange={e => handleChange(setting.key, e.target.value)}
            placeholder={setting.has_value ? (setting.masked || '••••••••') : 'Not configured'}
            className={inputClass + ' pr-10'}
          />
          <button onClick={() => toggleReveal(setting.key)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors">
            {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        </div>
      )
    }

    return <input type="text" value={currentVal} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass} />
  }

  const renderSettingRow = (setting: any) => (
    <div key={setting.key} className="flex items-start gap-4 py-3 border-b border-white/[0.04] last:border-0">
      <div className="flex-1 min-w-0 pt-1">
        <label className="block text-sm font-medium text-white">{setting.label}</label>
        {setting.description && <p className="text-xs text-gray-500 mt-0.5">{setting.description}</p>}
        {setting.source && (
          <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
            setting.source === 'database' ? 'bg-emerald-500/10 text-emerald-400'
            : setting.source === 'env' ? 'bg-amber-500/10 text-amber-400'
            : 'bg-white/[0.04] text-gray-600'
          }`}>
            {setting.source === 'database' ? <Database size={9} /> : setting.source === 'env' ? <Globe size={9} /> : null}
            {setting.source}
          </span>
        )}
      </div>
      <div className="w-72 flex-shrink-0">{renderField(setting)}</div>
    </div>
  )

  /* ─── Tab: General ───────────────────────────────────────────────────── */

  const renderGeneral = () => (
    <div className="space-y-6">
      {/* Account */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Users size={15} className="text-emerald-400" /> Account
        </h3>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'linear-gradient(135deg, rgba(116,200,149,0.2), rgba(116,200,149,0.05))' }}>
            <span className="text-lg font-bold text-emerald-400">{user?.name?.charAt(0) ?? 'A'}</span>
          </div>
          <div>
            <p className="font-semibold text-white">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className="inline-flex px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
              {(user as any)?.staff?.role?.replace('_', ' ').toUpperCase() ?? 'ADMIN'}
            </span>
          </div>
        </div>
      </div>

      {/* General settings */}
      {groupSettings('general').length > 0 && (
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Settings2 size={15} className="text-emerald-400" /> General Settings
          </h3>
          {groupSettings('general').map(renderSettingRow)}
        </div>
      )}
    </div>
  )

  /* ─── Tab: Branding ──────────────────────────────────────────────────── */

  const renderBranding = () => {
    const previewPrimary = getVal('primary_color') || '#c9a84c'
    const previewBg = getVal('background_color') || '#0d0d0d'
    const previewSurface = getVal('surface_color') || '#161616'
    const previewText = getVal('text_color') || '#ffffff'
    const previewText2 = getVal('text_secondary_color') || '#8e8e93'
    const previewBorder = getVal('border_color') || '#2c2c2c'
    const previewAccent = getVal('accent_color') || '#32d74b'
    const previewError = getVal('error_color') || '#ff375f'

    return (
      <div className="space-y-6">
        {/* Logo */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Upload size={15} className="text-emerald-400" /> Company Logo
          </h3>
          <p className="text-xs text-gray-500 mb-4">Displayed in the app header, member cards, and emails.</p>
          <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
          <div className="flex items-center gap-6">
            <div className="flex-shrink-0">
              {logoPreview || currentLogoUrl ? (
                <div className="relative group">
                  <img src={logoPreview || currentLogoUrl!} alt="Logo"
                    className="h-20 max-w-[200px] object-contain rounded-xl border border-white/[0.06] bg-[#0a1410] p-2" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => logoInputRef.current?.click()}>
                    <Upload size={20} className="text-white" />
                  </div>
                </div>
              ) : (
                <div className="h-20 w-40 rounded-xl border-2 border-dashed border-white/[0.08] flex items-center justify-center cursor-pointer hover:border-emerald-500/40 transition-colors"
                  onClick={() => logoInputRef.current?.click()}>
                  <div className="text-center">
                    <Upload size={20} className="mx-auto text-gray-600 mb-1" />
                    <span className="text-xs text-gray-600">Upload Logo</span>
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button onClick={() => logoInputRef.current?.click()} disabled={logoMutation.isPending}
                className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25'}>
                {logoMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
                {logoMutation.isPending ? 'Uploading...' : (currentLogoUrl ? 'Change Logo' : 'Upload Logo')}
              </button>
              <p className="text-[10px] text-gray-600">PNG, JPG, SVG or WebP. Max 4 MB.</p>
            </div>
          </div>
        </div>

        {/* Theme Presets */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Palette size={15} className="text-emerald-400" /> Theme Presets
          </h3>
          <p className="text-xs text-gray-500 mb-4">Quick-start with a preset, then customize individual colors below.</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PRESETS).map(([name, colors]) => (
              <button key={name} onClick={() => applyPreset(name)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/[0.06] hover:border-emerald-500/30 transition-all hover:-translate-y-px group"
                style={{ background: 'rgba(15,28,24,0.6)' }}>
                <div className="flex -space-x-1">
                  {[colors.primary_color, colors.background_color, colors.accent_color].map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded-full border border-black/30" style={{ backgroundColor: c }} />
                  ))}
                </div>
                <span className="text-xs text-gray-400 group-hover:text-white transition-colors">{name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Color Settings */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Palette size={15} className="text-emerald-400" /> Brand Colors
          </h3>
          {groupSettings('appearance').map(renderSettingRow)}
        </div>

        {/* Live Preview */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
            <Eye size={15} className="text-emerald-400" /> Live Preview
          </h3>
          <div className="rounded-xl overflow-hidden border" style={{ borderColor: previewBorder, backgroundColor: previewBg }}>
            <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: previewSurface, borderBottom: `1px solid ${previewBorder}` }}>
              <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: previewPrimary }}>
                <span style={{ color: previewBg, fontSize: 10, fontWeight: 700 }}>H</span>
              </div>
              <span style={{ color: previewText, fontSize: 13, fontWeight: 600 }}>Hotel Loyalty</span>
              <div className="flex-1" />
              <span style={{ color: previewText2, fontSize: 11 }}>Admin</span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-3">
                {['Dashboard', 'Members', 'Offers'].map((label, i) => (
                  <div key={label} className="px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: i === 0 ? previewPrimary + '20' : 'transparent', color: i === 0 ? previewPrimary : previewText2 }}>
                    {label}
                  </div>
                ))}
              </div>
              <div className="rounded-lg p-3" style={{ backgroundColor: previewSurface, border: `1px solid ${previewBorder}` }}>
                <p style={{ color: previewText, fontSize: 13, fontWeight: 600 }}>Active Members</p>
                <p style={{ color: previewPrimary, fontSize: 20, fontWeight: 700 }}>1,247</p>
                <p style={{ color: previewText2, fontSize: 11 }}>+12% from last month</p>
              </div>
              <div className="flex gap-2">
                <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewPrimary, color: previewBg }}>Primary</div>
                <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewAccent + '20', color: previewAccent }}>Success</div>
                <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewError + '20', color: previewError }}>Error</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Tab: Loyalty ───────────────────────────────────────────────────── */

  const renderLoyalty = () => (
    <div className="space-y-6">
      {/* Points settings */}
      {groupSettings('points').length > 0 && (
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
            <Star size={15} className="text-emerald-400" /> Points & Rewards
          </h3>
          {groupSettings('points').map(renderSettingRow)}
        </div>
      )}

      {/* Tiers */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Layers size={15} className="text-emerald-400" /> Loyalty Tiers
        </h3>
        {tiersLoading ? (
          <div className="space-y-3">
            {Array(4).fill(0).map((_, i) => <div key={i} className="h-16 bg-white/[0.02] rounded-xl animate-pulse" />)}
          </div>
        ) : (
          <div className="space-y-2">
            {(tiersData?.tiers ?? []).map((tier: any) => (
              <div key={tier.id} className="rounded-xl p-4 border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                style={{ background: 'rgba(15,28,24,0.5)' }}>
                <div className="flex items-center gap-4 mb-2">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: tier.color_hex ?? TIER_COLORS[tier.name] ?? '#94a3b8' }}>
                    {tier.icon ?? tier.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-bold text-white">{tier.name}</h4>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.04] text-gray-400 border border-white/[0.06]">
                        {tier.member_count} members
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      {tier.min_points.toLocaleString()} – {tier.max_points ? tier.max_points.toLocaleString() : '∞'} pts · <strong className="text-white">{tier.earn_rate}x</strong> earn
                    </p>
                  </div>
                </div>
                {tier.perks?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ml-14">
                    {tier.perks.map((perk: string, i: number) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">{perk}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  /* ─── Tab: Integrations ──────────────────────────────────────────────── */

  const renderIntegrations = () => {
    const intSettings = groupSettings('integrations')

    // Group integration settings into sections
    const sections: { title: string; icon: any; keys: string[]; testType?: string }[] = [
      { title: 'OpenAI', icon: Brain, keys: ['ai_openai_api_key', 'ai_openai_model'], testType: 'openai' },
      { title: 'Anthropic', icon: Brain, keys: ['ai_anthropic_api_key', 'ai_anthropic_model'], testType: 'anthropic' },
      { title: 'Smoobu PMS', icon: Calendar, keys: ['booking_smoobu_api_key', 'booking_smoobu_channel_id', 'booking_smoobu_base_url', 'booking_smoobu_webhook_secret'], testType: 'smoobu' },
      { title: 'Email / SMTP', icon: Mail, keys: ['mail_host', 'mail_port', 'mail_username', 'mail_password', 'mail_from_address', 'mail_from_name'], testType: 'mail' },
      { title: 'Push Notifications', icon: Smartphone, keys: ['expo_access_token'] },
    ]

    return (
      <div className="space-y-6">
        {sections.map(section => {
          const items = section.keys.map(k => intSettings.find((s: any) => s.key === k)).filter(Boolean)
          if (items.length === 0) return null
          const result = section.testType ? testResults[section.testType] : null

          return (
            <div key={section.title} className={cardClass} style={{
              ...cardStyle,
              background: result
                ? result.success
                  ? 'linear-gradient(180deg, rgba(18,28,22,0.96), rgba(14,22,18,0.98)), radial-gradient(circle at 100% 0, rgba(116,200,149,0.06), transparent 40%)'
                  : 'linear-gradient(180deg, rgba(28,18,18,0.96), rgba(22,14,14,0.98)), radial-gradient(circle at 100% 0, rgba(228,132,111,0.06), transparent 40%)'
                : cardStyle.background,
            }}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <section.icon size={15} className="text-emerald-400" /> {section.title}
                </h3>
                <div className="flex items-center gap-2">
                  {result && (
                    <span className={`flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                      result.success ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'
                    }`}>
                      {result.success ? <CheckCircle size={10} /> : <XCircle size={10} />}
                      {result.message}
                    </span>
                  )}
                  {section.testType && (
                    <button onClick={() => testConnection(section.testType!)}
                      disabled={testingIntegration === section.testType}
                      className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-40'}>
                      {testingIntegration === section.testType
                        ? <><RefreshCw size={13} className="animate-spin" /> Testing...</>
                        : <><Wifi size={13} /> Test Connection</>
                      }
                    </button>
                  )}
                </div>
              </div>
              {items.map((s: any) => renderSettingRow(s))}
            </div>
          )
        })}
      </div>
    )
  }

  /* ─── Tab: Booking ───────────────────────────────────────────────────── */

  const renderBooking = () => (
    <div className="space-y-6">
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Calendar size={15} className="text-emerald-400" /> Booking Engine Configuration
        </h3>
        <p className="text-xs text-gray-500 mb-4">Configure your booking widget — units, pricing, extras, and policies.</p>
        {groupSettings('booking').length === 0 ? (
          <p className="text-sm text-gray-600 py-8 text-center">No booking settings found. Run the integration settings migration to seed defaults.</p>
        ) : groupSettings('booking').map(renderSettingRow)}
      </div>
    </div>
  )

  /* ─── Tab: System ────────────────────────────────────────────────────── */

  const renderSystem = () => (
    <div className="space-y-6">
      {/* System Info */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Shield size={15} className="text-emerald-400" /> System Information
        </h3>
        <dl className="space-y-0">
          {[
            { label: 'API URL', value: import.meta.env.VITE_API_URL ?? 'localhost' },
            { label: 'App Version', value: 'v1.0.0' },
            { label: 'Stack', value: 'Laravel + React + Expo' },
            { label: 'AI Provider', value: getVal('ai_openai_model') || getVal('ai_anthropic_model') || 'Not configured' },
            { label: 'PMS', value: getVal('booking_smoobu_api_key') ? 'Smoobu (Connected)' : 'Smoobu (Not configured)' },
          ].map((item, i) => (
            <div key={i} className="flex justify-between py-3 border-b border-white/[0.04] last:border-0">
              <dt className="text-sm text-gray-500">{item.label}</dt>
              <dd className="text-sm font-medium text-white">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Quick Links */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <ExternalLink size={15} className="text-emerald-400" /> Quick Links
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'OpenAI Platform', icon: <Brain size={16} />, desc: 'API usage & billing', url: 'https://platform.openai.com/' },
            { label: 'Anthropic Console', icon: <Brain size={16} />, desc: 'Claude API dashboard', url: 'https://console.anthropic.com/' },
            { label: 'Smoobu', icon: <Calendar size={16} />, desc: 'PMS backoffice', url: 'https://login.smoobu.com/' },
            { label: 'Expo Dashboard', icon: <Smartphone size={16} />, desc: 'Mobile builds', url: 'https://expo.dev/' },
            { label: 'Laravel Cloud', icon: <Cloud size={16} />, desc: 'Deployment & logs', url: 'https://cloud.laravel.com/' },
            { label: 'DigitalOcean', icon: <Database size={16} />, desc: 'Server management', url: 'https://cloud.digitalocean.com/' },
          ].map(link => (
            <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer"
              className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.04] hover:border-emerald-500/20 transition-all hover:-translate-y-px group"
              style={{ background: 'rgba(15,28,24,0.5)' }}>
              <div className="text-emerald-400 mt-0.5">{link.icon}</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white group-hover:text-emerald-300 transition-colors flex items-center gap-1.5">
                  {link.label} <ExternalLink size={10} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                </p>
                <p className="text-[11px] text-gray-600">{link.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  )

  /* ─── Render Active Tab ──────────────────────────────────────────────── */

  const renderTabContent = () => {
    if (settingsLoading) {
      return (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className={cardClass + ' animate-pulse'} style={cardStyle}>
              <div className="h-5 bg-white/[0.04] rounded w-32 mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-white/[0.04] rounded-xl" />
                <div className="h-10 bg-white/[0.04] rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      )
    }

    switch (activeTab) {
      case 'general': return renderGeneral()
      case 'branding': return renderBranding()
      case 'loyalty': return renderLoyalty()
      case 'integrations': return renderIntegrations()
      case 'booking': return renderBooking()
      case 'system': return renderSystem()
      default: {
        // Generic tab — just render its settings
        return (
          <div className="space-y-6">
            {tabSettings.length === 0 ? (
              <div className={cardClass} style={cardStyle}>
                <p className="text-sm text-gray-600 py-8 text-center">No settings in this section yet.</p>
              </div>
            ) : (
              <div className={cardClass} style={cardStyle}>
                {tabSettings.map(renderSettingRow)}
              </div>
            )}
          </div>
        )
      }
    }
  }

  /* ─── Main Layout ────────────────────────────────────────────────────── */

  return (
    <div className="space-y-7">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ background: 'rgba(116,200,149,0.12)', color: '#74c895' }}>Configuration</div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your platform configuration, integrations, and branding</p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button onClick={() => setEditedSettings({})}
              className={btnPrimary + ' bg-white/[0.04] text-gray-400 border border-white/[0.06] hover:bg-white/[0.08]'}>
              <RotateCcw size={14} /> Discard
            </button>
            <button onClick={handleSave} disabled={saveMutation.isPending}
              className={btnPrimary + ' text-white border border-emerald-500/30 hover:border-emerald-500/50'}
              style={{ background: 'linear-gradient(135deg, rgba(116,200,149,0.25), rgba(116,200,149,0.1))' }}>
              {saveMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Top Tab Navigation */}
      <div className="rounded-2xl p-1.5 border border-white/[0.06]"
        style={{ background: 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => {
            const active = activeTab === tab.id
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  active ? 'text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                }`}
                style={active ? {
                  background: 'linear-gradient(135deg, rgba(116,200,149,0.15), rgba(116,200,149,0.05))',
                  border: '1px solid rgba(116,200,149,0.2)',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                } : { border: '1px solid transparent' }}>
                <tab.icon size={15} className={active ? 'text-emerald-400' : ''} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Content */}
      {renderTabContent()}
    </div>
  )
}
