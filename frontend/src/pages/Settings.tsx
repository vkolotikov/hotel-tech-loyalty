import { useState, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import {
  Save, RefreshCw, RotateCcw, Upload, ExternalLink, Palette, Settings2,
  Bell, Brain, Cloud, Smartphone, Database, Shield, Calendar,
  Mail, Wifi, CheckCircle, XCircle, Eye, EyeOff,
  Zap, Globe, Users, Star, Layers, CreditCard, MessageSquare, Map,
  ChevronDown, Link2, Phone,
  Clock,
  BookOpen, Search, HelpCircle, FileText
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useSubscription } from '../hooks/useSubscription'
import { BookingTab } from '../components/settings/BookingTab'

/* ─── Helpers ──────────────────────────────────────────────────────────── */

function formatDocContent(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\n- /g, '<br/>• ')
    .replace(/\n(\d+)\. /g, '<br/>$1. ')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>')
}

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
  'stripe_secret_key', 'stripe_webhook_secret',
  'twilio_auth_token',
  'whatsapp_access_token', 'whatsapp_verify_token',
  'google_maps_api_key', 'custom_webhook_secret',
]

interface ThemePreset {
  description: string
  colors: Record<string, string>
}

const PRESETS: Record<string, ThemePreset> = {
  'Gold Luxury': {
    description: 'Warm gold on charcoal — classic five-star feel',
    colors: {
      primary_color: '#c9a84c', secondary_color: '#1e1e1e', accent_color: '#32d74b',
      background_color: '#0d0d0d', surface_color: '#161616', text_color: '#ffffff',
      text_secondary_color: '#8e8e93', border_color: '#2c2c2c',
      error_color: '#ff375f', warning_color: '#ffd60a', info_color: '#0a84ff',
    },
  },
  'Royal Blue': {
    description: 'Deep navy + crisp blue — corporate & trustworthy',
    colors: {
      primary_color: '#3b82f6', secondary_color: '#1e293b', accent_color: '#22c55e',
      background_color: '#0f172a', surface_color: '#1e293b', text_color: '#f8fafc',
      text_secondary_color: '#94a3b8', border_color: '#334155',
      error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4',
    },
  },
  'Emerald Resort': {
    description: 'Lush green & amber — wellness retreats and spas',
    colors: {
      primary_color: '#10b981', secondary_color: '#1a2332', accent_color: '#f59e0b',
      background_color: '#0c1117', surface_color: '#141e29', text_color: '#f0fdf4',
      text_secondary_color: '#86efac', border_color: '#1e3a2f',
      error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#38bdf8',
    },
  },
  'Rose Boutique': {
    description: 'Warm rose & peach — boutique and lifestyle hotels',
    colors: {
      primary_color: '#e11d48', secondary_color: '#1c1017', accent_color: '#fb923c',
      background_color: '#0f0708', surface_color: '#1c1017', text_color: '#fff1f2',
      text_secondary_color: '#fda4af', border_color: '#3b1524',
      error_color: '#dc2626', warning_color: '#facc15', info_color: '#60a5fa',
    },
  },
  'Ocean Breeze': {
    description: 'Cyan & violet — coastal resorts and beach clubs',
    colors: {
      primary_color: '#06b6d4', secondary_color: '#0f2937', accent_color: '#a78bfa',
      background_color: '#0a1a24', surface_color: '#0f2937', text_color: '#ecfeff',
      text_secondary_color: '#67e8f9', border_color: '#164e63',
      error_color: '#fb7185', warning_color: '#fde047', info_color: '#818cf8',
    },
  },
  'Midnight Purple': {
    description: 'Violet & pink — nightlife venues and city hotels',
    colors: {
      primary_color: '#8b5cf6', secondary_color: '#1a1625', accent_color: '#f472b6',
      background_color: '#0e0b16', surface_color: '#1a1625', text_color: '#f5f3ff',
      text_secondary_color: '#a78bfa', border_color: '#2e1f4d',
      error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#22d3ee',
    },
  },
  'Sunset Coral': {
    description: 'Coral & amber — Mediterranean & desert resorts',
    colors: {
      primary_color: '#f97316', secondary_color: '#1f1410', accent_color: '#fbbf24',
      background_color: '#120906', surface_color: '#1f1410', text_color: '#fff7ed',
      text_secondary_color: '#fdba74', border_color: '#3b1f12',
      error_color: '#ef4444', warning_color: '#facc15', info_color: '#38bdf8',
    },
  },
  'Forest Spa': {
    description: 'Pine & sage — mountain lodges and eco retreats',
    colors: {
      primary_color: '#16a34a', secondary_color: '#0f1a14', accent_color: '#84cc16',
      background_color: '#08120c', surface_color: '#0f1a14', text_color: '#f0fdf4',
      text_secondary_color: '#86efac', border_color: '#1a2e22',
      error_color: '#dc2626', warning_color: '#eab308', info_color: '#0ea5e9',
    },
  },
  'Champagne': {
    description: 'Soft champagne & cream — refined and minimal',
    colors: {
      primary_color: '#d4af37', secondary_color: '#1c1814', accent_color: '#e5c494',
      background_color: '#100e0a', surface_color: '#1c1814', text_color: '#fdf6e3',
      text_secondary_color: '#c4a476', border_color: '#2e2820',
      error_color: '#e25555', warning_color: '#f5b400', info_color: '#5ec4e8',
    },
  },
  'Slate Modern': {
    description: 'Cool slate & cyan — modern minimalist business hotels',
    colors: {
      primary_color: '#64748b', secondary_color: '#0f172a', accent_color: '#06b6d4',
      background_color: '#020617', surface_color: '#0f172a', text_color: '#f1f5f9',
      text_secondary_color: '#94a3b8', border_color: '#1e293b',
      error_color: '#f43f5e', warning_color: '#facc15', info_color: '#0ea5e9',
    },
  },
  'Tropical Mint': {
    description: 'Mint & teal — Caribbean resorts and beach properties',
    colors: {
      primary_color: '#14b8a6', secondary_color: '#0a1f1d', accent_color: '#fde047',
      background_color: '#04110f', surface_color: '#0a1f1d', text_color: '#f0fdfa',
      text_secondary_color: '#5eead4', border_color: '#13332e',
      error_color: '#fb7185', warning_color: '#facc15', info_color: '#38bdf8',
    },
  },
  'Burgundy Wine': {
    description: 'Rich burgundy & gold — vineyard estates and wine country',
    colors: {
      primary_color: '#9f1239', secondary_color: '#1a0a0f', accent_color: '#d4af37',
      background_color: '#0e0608', surface_color: '#1a0a0f', text_color: '#fff1f2',
      text_secondary_color: '#e8aab6', border_color: '#3b1220',
      error_color: '#dc2626', warning_color: '#eab308', info_color: '#60a5fa',
    },
  },
  'Sky Minimal': {
    description: 'Sky blue & soft gray — light, airy and modern',
    colors: {
      primary_color: '#0ea5e9', secondary_color: '#0f1a23', accent_color: '#a78bfa',
      background_color: '#050b12', surface_color: '#0f1a23', text_color: '#f0f9ff',
      text_secondary_color: '#7dd3fc', border_color: '#1e3a52',
      error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#22d3ee',
    },
  },
  'Obsidian': {
    description: 'Pure black & electric blue — bold and dramatic',
    colors: {
      primary_color: '#3b82f6', secondary_color: '#0a0a0a', accent_color: '#22d3ee',
      background_color: '#000000', surface_color: '#0a0a0a', text_color: '#fafafa',
      text_secondary_color: '#737373', border_color: '#1a1a1a',
      error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4',
    },
  },
}

const DEFAULT_PRESET = 'Gold Luxury'

/* ─── Tab Config ────────────────────────────────────────────────────────── */

interface Tab {
  id: string
  label: string
  icon: any
  desc: string
  groups?: string[]
  custom?: boolean
  superAdminOnly?: boolean
  feature?: string   // required SaaS feature
  product?: string   // required SaaS product
}

const TABS: Tab[] = [
  { id: 'general',       label: 'General',        icon: Settings2,  desc: 'Company info & account',              groups: ['general'],      custom: true },
  { id: 'branding',      label: 'Branding',        icon: Palette,    desc: 'Colors, logo, theme presets',         groups: ['appearance'],   custom: true, feature: 'custom_branding' },
  { id: 'loyalty',       label: 'Loyalty',         icon: Star,       desc: 'Points, tiers & rewards',             groups: ['points'],       custom: true, product: 'loyalty' },
  { id: 'notifications', label: 'Notifications',   icon: Bell,       desc: 'Push & email notification config',    groups: ['notifications'], feature: 'push_notifications' },
  { id: 'integrations',  label: 'Integrations',    icon: Zap,        desc: 'PMS, payments, channels & messaging', groups: ['integrations'], custom: true, superAdminOnly: true },
  { id: 'booking',       label: 'Booking',         icon: Calendar,   desc: 'Booking engine configuration',        groups: ['booking'],      custom: true, product: 'booking' },
  { id: 'mobile_app',    label: 'Mobile App',      icon: Smartphone, desc: 'Loyalty mobile app appearance & preview', groups: ['mobile_app'], custom: true, product: 'loyalty' },
  { id: 'documentation', label: 'Documentation',   icon: BookOpen,   desc: 'Platform guides, use cases & FAQ',     custom: true },
  { id: 'ai_system',     label: 'AI & System',     icon: Shield,     desc: 'AI models, system info & diagnostics', custom: true, superAdminOnly: true },
]

/* ─── Component ─────────────────────────────────────────────────────────── */

export function Settings() {
  const { user, staff } = useAuthStore()
  const isSuperAdmin = staff?.role === 'super_admin'
  const { hasFeature, hasProduct } = useSubscription()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState('general')
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({})
  const [revealedSecrets, setRevealedSecrets] = useState<Set<string>>(new Set())
  const [testingIntegration, setTestingIntegration] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
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
      return api.post('/v1/admin/settings/logo', fd)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['settings-logo'] })
      setLogoPreview(null)
      toast.success('Logo uploaded')
    },
    onError: () => toast.error('Logo upload failed'),
  })

  /* ── Documentation Queries ───────────────────────────────────────────── */

  const { data: docsData, isLoading: docsLoading } = useQuery({
    queryKey: ['admin-documentation'],
    queryFn: () => api.get('/v1/admin/documentation').then(r => r.data),
    enabled: activeTab === 'documentation',
  })

  const [docsSearch, setDocsSearch] = useState('')
  const [activeDocSection, setActiveDocSection] = useState<string | null>(null)
  const [activeFaqCat, setActiveFaqCat] = useState<string>('All')

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
    setEditedSettings(prev => ({ ...prev, ...p.colors }))
    // Auto-save preset immediately
    const settings = Object.entries(p.colors).map(([key, value]) => ({ key, value }))
    saveMutation.mutate(settings)
  }

  // Detect which preset (if any) matches the current colors
  const detectActivePreset = (): string | null => {
    const current: Record<string, string> = {}
    for (const k of COLOR_KEYS) current[k] = (getVal(k) || '').toLowerCase()
    for (const [name, p] of Object.entries(PRESETS)) {
      if (COLOR_KEYS.every(k => current[k] === p.colors[k]?.toLowerCase())) return name
    }
    return null
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

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const hasChanges = Object.keys(editedSettings).length > 0

  // Get settings for a group (handle both array and object responses)
  const groupSettings = (groupName: string): any[] => {
    const raw = allSettings[groupName]
    if (!raw) return []
    return Array.isArray(raw) ? raw : Object.values(raw)
  }

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

    // AI model dropdowns
    if (setting.key === 'ai_openai_model') {
      const models = [
        { value: 'gpt-5.4', label: 'GPT-5.4 (most capable)' },
        { value: 'gpt-5.4-mini', label: 'GPT-5.4 Mini' },
        { value: 'gpt-5.4-nano', label: 'GPT-5.4 Nano (fastest)' },
        { value: 'gpt-4.1', label: 'GPT-4.1' },
        { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
        { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
        { value: 'gpt-4o', label: 'GPT-4o' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
        { value: 'o3-mini', label: 'o3-mini (reasoning)' },
      ]
      return (
        <select value={currentVal || 'gpt-4o'} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass}>
          {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      )
    }

    if (setting.key === 'ai_anthropic_model') {
      const models = [
        { value: 'claude-opus-4-20250514', label: 'Claude Opus 4 (most capable)' },
        { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
        { value: 'claude-sonnet-4-6-20250610', label: 'Claude Sonnet 4.6' },
        { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest)' },
      ]
      return (
        <select value={currentVal || 'claude-sonnet-4-20250514'} onChange={e => handleChange(setting.key, e.target.value)} className={inputClass}>
          {models.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
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
    const activePreset = detectActivePreset()
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
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Palette size={15} className="text-emerald-400" /> Theme Presets
              {activePreset && (
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                  {activePreset} active
                </span>
              )}
            </h3>
            <button onClick={() => applyPreset(DEFAULT_PRESET)}
              className="text-[11px] text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1">
              <RotateCcw size={11} /> Reset to default
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">Pick a curated palette tailored to your hotel style — applies instantly.</p>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(PRESETS).map(([name, preset]) => {
              const isActive = activePreset === name
              const c = preset.colors
              return (
                <button key={name} onClick={() => applyPreset(name)}
                  className={`text-left rounded-xl overflow-hidden border transition-all hover:-translate-y-px group ${
                    isActive ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(116,200,149,0.3)]' : 'border-white/[0.06] hover:border-emerald-500/30'
                  }`}
                  style={{ background: c.surface_color }}>
                  {/* Color band preview */}
                  <div className="h-12 flex">
                    <div className="flex-1" style={{ backgroundColor: c.primary_color }} />
                    <div className="flex-1" style={{ backgroundColor: c.accent_color }} />
                    <div className="flex-1" style={{ backgroundColor: c.secondary_color }} />
                    <div className="flex-1" style={{ backgroundColor: c.background_color }} />
                    <div className="flex-1" style={{ backgroundColor: c.info_color }} />
                  </div>
                  {/* Sample content */}
                  <div className="p-3" style={{ backgroundColor: c.background_color }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-bold" style={{ color: c.text_color }}>{name}</span>
                      {isActive && <CheckCircle size={12} style={{ color: c.primary_color }} />}
                    </div>
                    <p className="text-[10px] leading-snug line-clamp-2" style={{ color: c.text_secondary_color }}>
                      {preset.description}
                    </p>
                    <div className="flex items-center gap-1 mt-2">
                      {[c.primary_color, c.accent_color, c.error_color, c.warning_color, c.info_color].map((col, i) => (
                        <div key={i} className="w-3 h-3 rounded-full border" style={{ backgroundColor: col, borderColor: c.border_color }} />
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
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

  /* ─── Tab: Mobile App ────────────────────────────────────────────────── */

  const renderMobileApp = () => {
    const m = (k: string, fallback: string) => getVal(`mobile_${k}`) || fallback
    const primary    = m('primary_color',        '#c9a84c')
    const bg         = m('background_color',     '#0d0d0d')
    const surface    = m('surface_color',        '#161616')
    const surface2   = m('secondary_color',      '#1e1e1e')
    const text       = m('text_color',           '#ffffff')
    const text2      = m('text_secondary_color', '#8e8e93')
    const border     = m('border_color',         '#2c2c2c')
    const success    = m('success_color',        '#32d74b')
    const errorCol   = m('error_color',          '#ff375f')
    const warning    = m('warning_color',        '#ffd60a')
    const info       = m('info_color',           '#0a84ff')
    const cardStyleVal = getVal('mobile_card_style') || 'gradient'
    const radius       = parseInt(getVal('mobile_radius') || '16')
    const buttonStyle  = getVal('mobile_button_style') || 'filled'
    const accentIntensity = getVal('mobile_accent_intensity') || 'vibrant'

    const applyMobilePreset = (preset: Record<string, string>) => {
      const updates: Record<string, string> = {}
      for (const [k, v] of Object.entries(preset)) updates[`mobile_${k}`] = v
      setEditedSettings(prev => ({ ...prev, ...updates }))
      const settings = Object.entries(updates).map(([key, value]) => ({ key, value }))
      saveMutation.mutate(settings)
    }

    const MOBILE_PRESETS: { name: string; description: string; colors: Record<string, string> }[] = [
      { name: 'Gold Classic', description: 'Default — warm gold on near-black', colors: {
        primary_color: '#c9a84c', background_color: '#0d0d0d', surface_color: '#161616', secondary_color: '#1e1e1e',
        text_color: '#ffffff', text_secondary_color: '#8e8e93', border_color: '#2c2c2c',
        success_color: '#32d74b', error_color: '#ff375f', warning_color: '#ffd60a', info_color: '#0a84ff' } },
      { name: 'Royal Sapphire', description: 'Deep navy with crisp blue accents', colors: {
        primary_color: '#3b82f6', background_color: '#0a0f1e', surface_color: '#111827', secondary_color: '#1f2937',
        text_color: '#f8fafc', text_secondary_color: '#94a3b8', border_color: '#1f2a3a',
        success_color: '#22c55e', error_color: '#ef4444', warning_color: '#eab308', info_color: '#06b6d4' } },
      { name: 'Emerald Spa', description: 'Calming green for wellness brands', colors: {
        primary_color: '#10b981', background_color: '#06120c', surface_color: '#0f1f17', secondary_color: '#162a1f',
        text_color: '#f0fdf4', text_secondary_color: '#86efac', border_color: '#1e3a2f',
        success_color: '#22c55e', error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#38bdf8' } },
      { name: 'Rose Boutique', description: 'Warm rose for boutique hotels', colors: {
        primary_color: '#e11d48', background_color: '#0f0708', surface_color: '#1c1017', secondary_color: '#2a1620',
        text_color: '#fff1f2', text_secondary_color: '#fda4af', border_color: '#3b1524',
        success_color: '#10b981', error_color: '#dc2626', warning_color: '#facc15', info_color: '#60a5fa' } },
      { name: 'Ocean Resort', description: 'Cyan & violet for coastal properties', colors: {
        primary_color: '#06b6d4', background_color: '#04141c', surface_color: '#0f2937', secondary_color: '#163847',
        text_color: '#ecfeff', text_secondary_color: '#67e8f9', border_color: '#164e63',
        success_color: '#22c55e', error_color: '#fb7185', warning_color: '#fde047', info_color: '#818cf8' } },
      { name: 'Champagne Lux', description: 'Refined champagne on warm dark', colors: {
        primary_color: '#d4af37', background_color: '#100e0a', surface_color: '#1c1814', secondary_color: '#2a2418',
        text_color: '#fdf6e3', text_secondary_color: '#c4a476', border_color: '#2e2820',
        success_color: '#22c55e', error_color: '#e25555', warning_color: '#f5b400', info_color: '#5ec4e8' } },
      { name: 'Midnight Violet', description: 'Deep purple luxury for premium brands', colors: {
        primary_color: '#8b5cf6', background_color: '#0c0a14', surface_color: '#15112a', secondary_color: '#1e1836',
        text_color: '#f5f3ff', text_secondary_color: '#a78bfa', border_color: '#2e2654',
        success_color: '#34d399', error_color: '#f87171', warning_color: '#fbbf24', info_color: '#38bdf8' } },
      { name: 'Tropical Sunset', description: 'Warm coral & amber for island resorts', colors: {
        primary_color: '#f97316', background_color: '#120a06', surface_color: '#1e1410', secondary_color: '#2a1e18',
        text_color: '#fff7ed', text_secondary_color: '#fdba74', border_color: '#3d2a1e',
        success_color: '#4ade80', error_color: '#ef4444', warning_color: '#fde047', info_color: '#67e8f9' } },
      { name: 'Alpine Lodge', description: 'Earthy tones for mountain retreats', colors: {
        primary_color: '#78716c', background_color: '#0e0d0b', surface_color: '#1c1a17', secondary_color: '#292521',
        text_color: '#fafaf9', text_secondary_color: '#a8a29e', border_color: '#33302c',
        success_color: '#86efac', error_color: '#fca5a5', warning_color: '#fcd34d', info_color: '#93c5fd' } },
      { name: 'Urban Loft', description: 'Sleek monochrome for city hotels', colors: {
        primary_color: '#f5f5f5', background_color: '#09090b', surface_color: '#141416', secondary_color: '#1e1e22',
        text_color: '#fafafa', text_secondary_color: '#71717a', border_color: '#27272a',
        success_color: '#22c55e', error_color: '#ef4444', warning_color: '#eab308', info_color: '#3b82f6' } },
      { name: 'Desert Oasis', description: 'Terracotta & sand for desert properties', colors: {
        primary_color: '#c2410c', background_color: '#0f0a07', surface_color: '#1a140e', secondary_color: '#261e16',
        text_color: '#fef3c7', text_secondary_color: '#d6a56a', border_color: '#3b2e20',
        success_color: '#4ade80', error_color: '#fb923c', warning_color: '#fde68a', info_color: '#7dd3fc' } },
      { name: 'Nordic Ice', description: 'Cool minimalist for Scandinavian brands', colors: {
        primary_color: '#0ea5e9', background_color: '#070c10', surface_color: '#0e1620', secondary_color: '#162032',
        text_color: '#f0f9ff', text_secondary_color: '#7dd3fc', border_color: '#1e3048',
        success_color: '#34d399', error_color: '#fb7185', warning_color: '#fde047', info_color: '#a78bfa' } },
    ]

    // Detect active mobile preset
    const activeMobilePreset = (() => {
      const cur: Record<string, string> = {
        primary_color: primary, background_color: bg, surface_color: surface, secondary_color: surface2,
        text_color: text, text_secondary_color: text2, border_color: border,
        success_color: success, error_color: errorCol, warning_color: warning, info_color: info,
      }
      for (const p of MOBILE_PRESETS) {
        if (Object.keys(p.colors).every(k => cur[k]?.toLowerCase() === p.colors[k]?.toLowerCase())) return p.name
      }
      return null
    })()

    return (
      <div className="space-y-6">
        {/* Intro */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
            <Smartphone size={15} className="text-emerald-400" /> Loyalty Mobile App Theme
          </h3>
          <p className="text-xs text-gray-500">
            These colors apply to the <strong className="text-gray-300">Loyalty Member app</strong> and the <strong className="text-gray-300">Loyalty Staff app</strong>.
            Configured separately from the web admin theme — apps fetch the latest colors on launch, no rebuild required.
          </p>
        </div>

        {/* Layout: presets + settings on left, live phone preview on right */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column — controls */}
          <div className="lg:col-span-2 space-y-6">
            {/* Mobile Presets */}
            <div className={cardClass} style={cardStyle}>
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palette size={15} className="text-emerald-400" /> Mobile Presets
                  {activeMobilePreset && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                      {activeMobilePreset} active
                    </span>
                  )}
                </h3>
                <button onClick={() => applyMobilePreset(MOBILE_PRESETS[0].colors)}
                  className="text-[11px] text-gray-500 hover:text-emerald-400 transition-colors flex items-center gap-1">
                  <RotateCcw size={11} /> Reset
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-4">Tap to apply — saves instantly and updates the preview.</p>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {MOBILE_PRESETS.map(preset => {
                  const c = preset.colors
                  const isActive = activeMobilePreset === preset.name
                  return (
                    <button key={preset.name} onClick={() => applyMobilePreset(c)}
                      className={`text-left rounded-xl overflow-hidden border transition-all hover:-translate-y-px hover:shadow-lg ${
                        isActive ? 'border-emerald-500/50 shadow-[0_0_0_1px_rgba(116,200,149,0.3)]' : 'border-white/[0.06] hover:border-emerald-500/30'
                      }`}
                      style={{ background: c.surface_color }}>
                      <div className="h-8 flex">
                        <div className="flex-1" style={{ backgroundColor: c.primary_color }} />
                        <div className="flex-1" style={{ backgroundColor: c.background_color }} />
                        <div className="flex-1" style={{ backgroundColor: c.success_color }} />
                        <div className="flex-1" style={{ backgroundColor: c.info_color }} />
                      </div>
                      <div className="p-2" style={{ backgroundColor: c.background_color }}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-bold" style={{ color: c.text_color }}>{preset.name}</span>
                          {isActive && <CheckCircle size={10} style={{ color: c.primary_color }} />}
                        </div>
                        <p className="text-[8px] leading-snug line-clamp-1" style={{ color: c.text_secondary_color }}>
                          {preset.description}
                        </p>
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Loyalty Card Style + Radius */}
            <div className={cardClass} style={cardStyle}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <CreditCard size={15} className="text-emerald-400" /> Card Style
              </h3>
              <div className="grid grid-cols-3 gap-2 mb-4">
                {(['gradient', 'solid', 'glass'] as const).map(style => (
                  <button key={style} onClick={() => handleChange('mobile_card_style', style)}
                    className={`px-3 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                      cardStyleVal === style
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                        : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-emerald-500/30'
                    }`}>
                    {style}
                  </button>
                ))}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs text-gray-400">Corner Radius</label>
                  <span className="text-xs font-mono text-emerald-400">{radius}px</span>
                </div>
                <input type="range" min="0" max="32" value={radius}
                  onChange={e => handleChange('mobile_radius', e.target.value)}
                  className="w-full accent-emerald-500" />
              </div>

              {/* Button Style */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <label className="text-xs text-gray-400 mb-2 block">Button Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['filled', 'outline', 'soft'] as const).map(style => (
                    <button key={style} onClick={() => handleChange('mobile_button_style', style)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        buttonStyle === style
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-emerald-500/30'
                      }`}>
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent Intensity */}
              <div className="mt-4 pt-4 border-t border-white/[0.06]">
                <label className="text-xs text-gray-400 mb-2 block">Accent Intensity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['subtle', 'vibrant', 'bold'] as const).map(intensity => (
                    <button key={intensity} onClick={() => handleChange('mobile_accent_intensity', intensity)}
                      className={`px-3 py-2.5 rounded-xl border text-xs font-semibold capitalize transition-all ${
                        accentIntensity === intensity
                          ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/[0.06] bg-white/[0.02] text-gray-400 hover:border-emerald-500/30'
                      }`}>
                      {intensity}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Color settings */}
            <div className={cardClass} style={cardStyle}>
              <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                <Palette size={15} className="text-emerald-400" /> Mobile Colors
              </h3>
              <p className="text-xs text-gray-500 mb-2">Fine-tune individual colors. Changes save when you click Save.</p>
              {groupSettings('mobile_app').filter(s => s.key.startsWith('mobile_') && s.key !== 'mobile_card_style' && s.key !== 'mobile_radius').map(renderSettingRow)}
            </div>
          </div>

          {/* Right column — Live phone preview */}
          <div className="lg:col-span-1">
            <div className={cardClass + ' lg:sticky lg:top-4'} style={cardStyle}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Eye size={15} className="text-emerald-400" /> Live Preview
              </h3>
              {/* Phone frame */}
              <div className="mx-auto" style={{ maxWidth: 280 }}>
                <div className="rounded-[36px] p-2 border-4 border-gray-800 shadow-2xl"
                  style={{ background: '#000' }}>
                  <div className="rounded-[28px] overflow-hidden" style={{ background: bg, height: 540 }}>
                    {/* Status bar */}
                    <div className="px-5 pt-2 pb-1 flex items-center justify-between text-[10px]" style={{ color: text }}>
                      <span>9:41</span>
                      <span>•••</span>
                    </div>
                    {/* Header */}
                    <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: surface, borderBottom: `1px solid ${border}` }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                        style={{ backgroundColor: primary, color: bg }}>H</div>
                      <span className="text-xs font-bold" style={{ color: text }}>Hotel Loyalty</span>
                    </div>
                    {/* Loyalty card hero */}
                    <div className="px-4 pt-4">
                      <div
                        className="p-4 relative overflow-hidden"
                        style={{
                          borderRadius: radius,
                          background:
                            cardStyleVal === 'gradient'
                              ? `linear-gradient(135deg, ${primary} 0%, ${primary}99 60%, ${surface2} 100%)`
                              : cardStyleVal === 'glass'
                                ? `${primary}25`
                                : primary,
                          border: cardStyleVal === 'glass' ? `1px solid ${primary}50` : 'none',
                          backdropFilter: cardStyleVal === 'glass' ? 'blur(8px)' : undefined,
                        }}>
                        <p className="text-[9px] uppercase tracking-wider opacity-80" style={{ color: cardStyleVal === 'glass' ? text : bg }}>Gold Member</p>
                        <p className="text-[11px] mt-0.5" style={{ color: cardStyleVal === 'glass' ? text : bg }}>Sarah Johnson</p>
                        <div className="flex items-end justify-between mt-3">
                          <div>
                            <p className="text-[9px] opacity-70" style={{ color: cardStyleVal === 'glass' ? text2 : bg }}>Points</p>
                            <p className="text-xl font-bold" style={{ color: cardStyleVal === 'glass' ? text : bg }}>2,485</p>
                          </div>
                          <CreditCard size={20} style={{ color: cardStyleVal === 'glass' ? text : bg, opacity: 0.7 }} />
                        </div>
                      </div>
                    </div>
                    {/* Stats row */}
                    <div className="px-4 mt-3 grid grid-cols-3 gap-2">
                      {[
                        { label: 'Visits', value: '12', color: success },
                        { label: 'Tier', value: 'Gold', color: warning },
                        { label: 'Offers', value: '4', color: info },
                      ].map(stat => (
                        <div key={stat.label} className="p-2 text-center"
                          style={{ borderRadius: radius * 0.6, backgroundColor: surface2, border: `1px solid ${border}` }}>
                          <p className="text-sm font-bold" style={{ color: stat.color }}>{stat.value}</p>
                          <p className="text-[8px] uppercase" style={{ color: text2 }}>{stat.label}</p>
                        </div>
                      ))}
                    </div>
                    {/* List item */}
                    <div className="px-4 mt-3">
                      <div className="p-2.5 flex items-center gap-2" style={{ borderRadius: radius * 0.7, backgroundColor: surface2, border: `1px solid ${border}` }}>
                        <div className="w-8 h-8 flex items-center justify-center" style={{ borderRadius: radius * 0.5, backgroundColor: primary + '25' }}>
                          <Star size={14} style={{ color: primary }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] font-semibold truncate" style={{ color: text }}>15% off Spa Treatment</p>
                          <p className="text-[8px]" style={{ color: text2 }}>Expires in 7 days</p>
                        </div>
                        <span className="text-[9px] font-bold px-1.5 py-0.5" style={{ color: errorCol, backgroundColor: errorCol + '20', borderRadius: radius * 0.3 }}>NEW</span>
                      </div>
                    </div>
                    {/* Bottom button */}
                    <div className="px-4 mt-3">
                      <div className="py-2.5 text-center text-[10px] font-bold"
                        style={{
                          borderRadius: radius * 0.7,
                          backgroundColor: buttonStyle === 'filled' ? primary : buttonStyle === 'soft' ? primary + '20' : 'transparent',
                          color: buttonStyle === 'filled' ? bg : primary,
                          border: buttonStyle === 'outline' ? `2px solid ${primary}` : 'none',
                        }}>
                        Redeem Now
                      </div>
                    </div>
                    {/* Tab bar */}
                    <div className="absolute bottom-0 left-0 right-0 px-4 py-2 flex items-center justify-around"
                      style={{ borderTop: `1px solid ${border}`, backgroundColor: surface }}>
                      {[
                        { Icon: Star, active: true },
                        { Icon: CreditCard, active: false },
                        { Icon: Bell, active: false },
                        { Icon: Settings2, active: false },
                      ].map(({ Icon, active }, i) => (
                        <Icon key={i} size={16} style={{ color: active ? primary : text2 }} />
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-center text-gray-600 mt-2">Live preview — updates as you tweak colors</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Tab: Loyalty ───────────────────────────────────────────────────── */

  const renderLoyalty = () => {
    const tiers = tiersData?.tiers ?? []
    const totalMembers = tiers.reduce((sum: number, t: any) => sum + (t.member_count || 0), 0)
    const welcomeBonus = parseInt(getVal('welcome_bonus_points') || '0')
    const pointsPerDollar = parseInt(getVal('points_per_dollar') || '0')
    const referrerBonus = parseInt(getVal('referrer_bonus_points') || '0')
    const minRedeem = parseInt(getVal('min_redeem_points') || '0')
    const expiryMonths = parseInt(getVal('points_expiry_months') || '0')

    return (
    <div className="space-y-6">
      {/* Loyalty Overview */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Star size={15} className="text-emerald-400" /> Loyalty Program Overview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Active Members', value: totalMembers.toLocaleString(),       sub: 'across all tiers',     color: '#74c895' },
            { label: 'Welcome Bonus',  value: welcomeBonus.toLocaleString() + ' pts', sub: 'awarded on signup',  color: '#fbbf24' },
            { label: 'Earn Rate',      value: pointsPerDollar + ' pts/$',          sub: 'base earning rate',     color: '#60a5fa' },
            { label: 'Min Redeem',     value: minRedeem.toLocaleString() + ' pts', sub: 'redemption threshold', color: '#a78bfa' },
          ].map(stat => (
            <div key={stat.label} className="rounded-xl p-3 border border-white/[0.04]"
              style={{ background: 'rgba(15,28,24,0.5)' }}>
              <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500">{stat.label}</p>
              <p className="text-xl font-bold mt-0.5" style={{ color: stat.color }}>{stat.value}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{stat.sub}</p>
            </div>
          ))}
        </div>

        {/* Tier distribution bar */}
        {tiers.length > 0 && totalMembers > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-gray-500 mb-2">Tier Distribution</p>
            <div className="h-3 rounded-full overflow-hidden flex border border-white/[0.06]" style={{ background: 'rgba(15,28,24,0.5)' }}>
              {tiers.map((tier: any) => {
                const pct = totalMembers > 0 ? (tier.member_count / totalMembers) * 100 : 0
                if (pct === 0) return null
                return (
                  <div key={tier.id} title={`${tier.name}: ${tier.member_count} (${pct.toFixed(1)}%)`}
                    style={{ width: `${pct}%`, backgroundColor: tier.color_hex ?? TIER_COLORS[tier.name] ?? '#94a3b8' }} />
                )
              })}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
              {tiers.map((tier: any) => {
                const pct = totalMembers > 0 ? (tier.member_count / totalMembers) * 100 : 0
                return (
                  <div key={tier.id} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: tier.color_hex ?? TIER_COLORS[tier.name] ?? '#94a3b8' }} />
                    <span className="text-[11px] text-gray-400">
                      <strong className="text-white">{tier.name}</strong> {tier.member_count} <span className="text-gray-600">({pct.toFixed(0)}%)</span>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Quick health indicators */}
        <div className="mt-5 pt-4 border-t border-white/[0.04] flex flex-wrap gap-2">
          {referrerBonus > 0 && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              <CheckCircle size={10} className="inline -mt-px mr-1" />
              Referral program live ({referrerBonus} pts)
            </span>
          )}
          {expiryMonths > 0 ? (
            <span className="text-[11px] px-2 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/15">
              <Clock size={10} className="inline -mt-px mr-1" />
              Points expire after {expiryMonths} months
            </span>
          ) : (
            <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">
              <CheckCircle size={10} className="inline -mt-px mr-1" />
              Points never expire
            </span>
          )}
          {tiers.length > 0 && (
            <span className="text-[11px] px-2 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/15">
              <Layers size={10} className="inline -mt-px mr-1" />
              {tiers.length} tier{tiers.length === 1 ? '' : 's'} configured
            </span>
          )}
        </div>
      </div>

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
  }

  /* ─── Tab: Integrations ──────────────────────────────────────────────── */

  const renderIntegrations = () => {
    const intSettings = groupSettings('integrations')

    type Section = { id: string; title: string; subtitle: string; icon: any; keys: string[]; testType?: string }

    // ── PMS / Booking Engines ──
    const pmsSections: Section[] = [
      { id: 'smoobu',           title: 'Smoobu',            subtitle: 'All-in-one vacation rental PMS & channel manager',    icon: Calendar,  keys: ['booking_smoobu_api_key', 'booking_smoobu_channel_id', 'booking_smoobu_base_url', 'booking_smoobu_webhook_secret'], testType: 'smoobu' },
      { id: 'cloudbeds',        title: 'Cloudbeds',         subtitle: 'Hotel & hostel PMS with built-in booking engine',     icon: Calendar,  keys: ['cloudbeds_api_key', 'cloudbeds_property_id', 'cloudbeds_client_id', 'cloudbeds_client_secret'] },
      { id: 'mews',             title: 'Mews',              subtitle: 'Modern cloud-native PMS for hotels & hostels',        icon: Calendar,  keys: ['mews_access_token', 'mews_client_token', 'mews_platform_url'] },
      { id: 'guesty',           title: 'Guesty',            subtitle: 'Vacation rental & short-term property management',    icon: Calendar,  keys: ['guesty_api_key', 'guesty_api_secret', 'guesty_account_id'] },
      { id: 'hostaway',         title: 'Hostaway',          subtitle: 'Vacation rental management & channel distribution',   icon: Calendar,  keys: ['hostaway_api_key', 'hostaway_account_id'] },
      { id: 'beds24',           title: 'Beds24',            subtitle: 'Channel manager & PMS for all property types',        icon: Calendar,  keys: ['beds24_api_key', 'beds24_property_id'] },
      { id: 'lodgify',          title: 'Lodgify',           subtitle: 'Vacation rental software with booking website',       icon: Calendar,  keys: ['lodgify_api_key', 'lodgify_property_id'] },
      { id: 'little_hotelier',  title: 'Little Hotelier',   subtitle: 'Small hotel & B&B management system',                icon: Calendar,  keys: ['little_hotelier_api_key', 'little_hotelier_property_id'] },
      { id: 'roomraccoon',      title: 'RoomRaccoon',       subtitle: 'Hotel management with revenue optimization',          icon: Calendar,  keys: ['roomraccoon_api_key', 'roomraccoon_property_id'] },
    ]

    // ── OTA / Channels ──
    const channelSections: Section[] = [
      { id: 'booking_com', title: 'Booking.com',  subtitle: 'Connectivity partner API for availability & rates', icon: Globe,    keys: ['booking_com_hotel_id', 'booking_com_api_key'] },
      { id: 'airbnb',      title: 'Airbnb',       subtitle: 'Host API for listing & reservation sync',          icon: Globe,    keys: ['airbnb_api_key', 'airbnb_listing_ids'] },
      { id: 'expedia',     title: 'Expedia',      subtitle: 'EPS API for rates, availability & bookings',       icon: Globe,    keys: ['expedia_api_key', 'expedia_property_id'] },
    ]

    // ── Payments & Communication ──
    const serviceSections: Section[] = [
      { id: 'stripe',    title: 'Stripe',              subtitle: 'Payment processing for bookings & invoices',  icon: CreditCard,    keys: ['stripe_publishable_key', 'stripe_secret_key', 'stripe_webhook_secret', 'stripe_currency'], testType: 'stripe' },
      { id: 'mail',      title: 'Email / SMTP',        subtitle: 'Transactional emails & notifications',        icon: Mail,          keys: ['mail_host', 'mail_port', 'mail_username', 'mail_password', 'mail_from_address', 'mail_from_name'], testType: 'mail' },
      { id: 'twilio',    title: 'Twilio',              subtitle: 'SMS notifications & booking confirmations',   icon: Phone,         keys: ['twilio_account_sid', 'twilio_auth_token', 'twilio_phone_number'], testType: 'twilio' },
      { id: 'whatsapp',  title: 'WhatsApp Business',   subtitle: 'Guest messaging via Meta Cloud API',          icon: MessageSquare, keys: ['whatsapp_phone_id', 'whatsapp_access_token', 'whatsapp_verify_token'], testType: 'whatsapp' },
      { id: 'expo',      title: 'Push Notifications',  subtitle: 'Expo push service for mobile app',            icon: Smartphone,    keys: ['expo_access_token'] },
      { id: 'google',    title: 'Google Services',     subtitle: 'Maps, Analytics & Tag Manager',               icon: Map,           keys: ['google_maps_api_key', 'google_analytics_id', 'google_tag_manager_id'], testType: 'google_maps' },
      { id: 'webhooks',  title: 'Webhooks & Zapier',   subtitle: 'Outbound event notifications & automation',   icon: Link2,         keys: ['zapier_webhook_url', 'custom_webhook_url', 'custom_webhook_secret'] },
    ]

    const allSections = [
      { label: 'Property Management Systems', sections: pmsSections },
      { label: 'OTA & Channels', sections: channelSections },
      { label: 'Payments & Communication', sections: serviceSections },
    ]

    const renderSection = (section: Section) => {
      const items = section.keys.map(k => intSettings.find((s: any) => s.key === k)).filter(Boolean)
      if (items.length === 0) return null
      const isOpen = expandedSections.has(section.id)
      const result = section.testType ? testResults[section.testType] : null
      const hasAnyValue = items.some((s: any) => s.has_value)

      return (
        <div key={section.id} className="rounded-2xl border border-white/[0.06] overflow-hidden transition-all"
          style={{
            background: result
              ? result.success
                ? 'linear-gradient(180deg, rgba(18,28,22,0.96), rgba(14,22,18,0.98)), radial-gradient(circle at 100% 0, rgba(116,200,149,0.06), transparent 40%)'
                : 'linear-gradient(180deg, rgba(28,18,18,0.96), rgba(22,14,14,0.98)), radial-gradient(circle at 100% 0, rgba(228,132,111,0.06), transparent 40%)'
              : 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))',
            boxShadow: '0 8px 20px rgba(0,0,0,0.12)',
          }}>
          <button onClick={() => toggleSection(section.id)}
            className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-white/[0.02] transition-colors">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: hasAnyValue ? 'rgba(116,200,149,0.12)' : 'rgba(255,255,255,0.04)' }}>
              <section.icon size={15} className={hasAnyValue ? 'text-emerald-400' : 'text-gray-500'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">{section.title}</span>
                {hasAnyValue && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Active</span>}
                {result && (
                  <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${result.success ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                    {result.success ? <CheckCircle size={8} /> : <XCircle size={8} />} {result.message}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">{section.subtitle}</p>
            </div>
            <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </button>
          {isOpen && (
            <div className="px-5 pb-4 border-t border-white/[0.04]">
              {section.testType && (
                <div className="flex justify-end pt-3 pb-1">
                  <button onClick={() => testConnection(section.testType!)}
                    disabled={testingIntegration === section.testType}
                    className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-40 text-xs'}>
                    {testingIntegration === section.testType ? <><RefreshCw size={12} className="animate-spin" /> Testing...</> : <><Wifi size={12} /> Test</>}
                  </button>
                </div>
              )}
              {items.map((s: any) => renderSettingRow(s))}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="space-y-8">
        {allSections.map(group => {
          const rendered = group.sections.map(s => renderSection(s)).filter(Boolean)
          if (rendered.length === 0) return null
          return (
            <div key={group.label}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1 mb-3">{group.label}</h3>
              <div className="space-y-2">{rendered}</div>
            </div>
          )
        })}
      </div>
    )
  }

  /* ─── Tab: Booking ───────────────────────────────────────────────────── */

  const widgetToken = settingsData?.widget_token || ''

  const renderBooking = () => (
    <BookingTab
      getVal={getVal}
      handleChange={handleChange}
      widgetToken={widgetToken}
      cardClass={cardClass}
      cardStyle={cardStyle}
      inputClass={inputClass}
      btnPrimary={btnPrimary}
    />
  )

  // Booking implementation lives in components/settings/BookingTab.tsx — extracted
  // from this file to keep Settings.tsx focused on tab orchestration.


  /* ─── Tab: Documentation ─────────────────────────────────────────────── */

  const ICON_MAP: Record<string, any> = { Globe, Users, Star, Calendar, Brain, Layers, Bell, Map, Shield, Zap, Settings2 }

  const renderDocumentation = () => {
    if (docsLoading) return (
      <div className="space-y-4">{Array(3).fill(0).map((_, i) => (
        <div key={i} className={cardClass + ' animate-pulse'} style={cardStyle}>
          <div className="h-5 bg-white/[0.04] rounded w-48 mb-3" /><div className="h-20 bg-white/[0.04] rounded-xl" />
        </div>
      ))}</div>
    )

    const sections: any[] = docsData?.sections ?? []
    const faq: any[] = docsData?.faq ?? []
    const faqCategories = ['All', ...Array.from(new Set(faq.map((f: any) => f.category)))]

    // Filter by search
    const q = docsSearch.toLowerCase()
    const filteredSections = q ? sections.filter((s: any) =>
      s.title.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) ||
      s.articles.some((a: any) => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q))
    ) : sections
    const filteredFaq = faq.filter((f: any) =>
      (activeFaqCat === 'All' || f.category === activeFaqCat) &&
      (!q || f.question.toLowerCase().includes(q) || f.answer.toLowerCase().includes(q))
    )

    return (
      <div className="space-y-6">
        {/* Search bar */}
        <div className={cardClass} style={cardStyle}>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input value={docsSearch} onChange={e => setDocsSearch(e.target.value)}
              placeholder="Search documentation & FAQ..."
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white text-sm placeholder:text-gray-600 focus:outline-none focus:border-emerald-500/30" />
          </div>
        </div>

        {/* Section cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredSections.map((section: any) => {
            const IconComp = ICON_MAP[section.icon] || FileText
            return (
              <button key={section.slug} onClick={() => setActiveDocSection(activeDocSection === section.slug ? null : section.slug)}
                className={`text-left rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${
                  activeDocSection === section.slug ? 'border-emerald-500/30 bg-emerald-500/[0.04]' : 'border-white/[0.06] hover:border-white/[0.12]'
                }`} style={{ background: activeDocSection === section.slug ? undefined : 'linear-gradient(180deg, rgba(18,24,22,0.96), rgba(14,20,18,0.98))' }}>
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: 'rgba(116,200,149,0.12)' }}>
                    <IconComp size={16} className="text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-white">{section.title}</h3>
                    <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">{section.description}</p>
                    <p className="text-[10px] text-gray-600 mt-2">{section.articles.length} articles</p>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Expanded section articles */}
        {activeDocSection && (() => {
          const section = sections.find((s: any) => s.slug === activeDocSection)
          if (!section) return null
          return (
            <div className={cardClass} style={cardStyle}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">{section.title}</h3>
                <button onClick={() => setActiveDocSection(null)} className="text-xs text-gray-500 hover:text-gray-300">Close</button>
              </div>
              <div className="space-y-6">
                {section.articles.map((article: any, i: number) => (
                  <div key={i} className="rounded-xl border border-white/[0.04] p-5" style={{ background: 'rgba(15,28,24,0.5)' }}>
                    <h4 className="text-sm font-bold text-emerald-300 mb-3 flex items-center gap-2">
                      <FileText size={14} /> {article.title}
                    </h4>
                    <div className="text-sm text-gray-400 leading-relaxed whitespace-pre-line"
                      dangerouslySetInnerHTML={{ __html: formatDocContent(article.content) }} />
                  </div>
                ))}
              </div>
            </div>
          )
        })()}

        {/* FAQ Section */}
        <div className={cardClass} style={cardStyle}>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <HelpCircle size={18} className="text-emerald-400" /> Frequently Asked Questions
          </h3>

          {/* Category pills */}
          <div className="flex flex-wrap gap-2 mb-5">
            {faqCategories.map(cat => (
              <button key={cat} onClick={() => setActiveFaqCat(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  activeFaqCat === cat ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-white/[0.03] text-gray-500 border border-white/[0.06] hover:text-gray-300'
                }`}>{cat}</button>
            ))}
          </div>

          {/* FAQ items */}
          <div className="space-y-3">
            {filteredFaq.map((item: any, i: number) => (
              <details key={i} className="group rounded-xl border border-white/[0.06] overflow-hidden">
                <summary className="px-5 py-3.5 cursor-pointer hover:bg-white/[0.02] transition-colors flex items-center gap-3">
                  <ChevronDown size={14} className="text-gray-500 transition-transform group-open:rotate-180 flex-shrink-0" />
                  <span className="text-sm font-medium text-white">{item.question}</span>
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-gray-600 bg-white/[0.04] px-2 py-0.5 rounded-full flex-shrink-0">{item.category}</span>
                </summary>
                <div className="px-5 pb-4 pt-1 border-t border-white/[0.04]">
                  <p className="text-sm text-gray-400 leading-relaxed">{item.answer}</p>
                </div>
              </details>
            ))}
            {filteredFaq.length === 0 && (
              <p className="text-sm text-gray-600 text-center py-8">No FAQ items match your search.</p>
            )}
          </div>
        </div>

        {/* AI Chat tip */}
        <div className="rounded-2xl border border-emerald-500/15 p-5" style={{ background: 'linear-gradient(135deg, rgba(116,200,149,0.06), rgba(116,200,149,0.02))' }}>
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(116,200,149,0.15)' }}>
              <Brain size={16} className="text-emerald-400" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-white">Need more help?</h4>
              <p className="text-xs text-gray-400 mt-1">Click the AI Chat button (bottom-right) and ask any question about the platform. The AI assistant has access to all this documentation and can provide personalized guidance for your specific needs.</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  /* ─── Tab: AI & System (super admin only) ─────────────────────────────── */

  const renderAiSystem = () => {
    const intSettings = groupSettings('integrations')
    const aiSections = [
      { id: 'openai',    title: 'OpenAI',    subtitle: 'GPT models for chatbot, insights & offers', icon: Brain, keys: ['ai_openai_api_key', 'ai_openai_model'], testType: 'openai' },
      { id: 'anthropic', title: 'Anthropic',  subtitle: 'Claude models for CRM AI assistant',        icon: Brain, keys: ['ai_anthropic_api_key', 'ai_anthropic_model'], testType: 'anthropic' },
    ]

    return (
      <div className="space-y-6">
        {/* AI Providers */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">AI Providers</h3>
          {aiSections.map(section => {
            const items = section.keys.map(k => intSettings.find((s: any) => s.key === k)).filter(Boolean)
            if (items.length === 0) return null
            const isOpen = expandedSections.has(section.id)
            const result = section.testType ? testResults[section.testType] : null
            const hasAnyValue = items.some((s: any) => s.has_value)

            return (
              <div key={section.id} className="rounded-2xl border border-white/[0.06] overflow-hidden" style={cardStyle}>
                <button onClick={() => toggleSection(section.id)}
                  className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-white/[0.02] transition-colors">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: hasAnyValue ? 'rgba(116,200,149,0.12)' : 'rgba(255,255,255,0.04)' }}>
                    <section.icon size={16} className={hasAnyValue ? 'text-emerald-400' : 'text-gray-500'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{section.title}</span>
                      {hasAnyValue && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/15">Active</span>}
                      {result && (
                        <span className={`flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${result.success ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                          {result.success ? <CheckCircle size={8} /> : <XCircle size={8} />} {result.message}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5">{section.subtitle}</p>
                  </div>
                  <ChevronDown size={14} className={`text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                {isOpen && (
                  <div className="px-6 pb-5 border-t border-white/[0.04]">
                    <div className="flex justify-end pt-4 pb-2">
                      <button onClick={() => testConnection(section.testType)}
                        disabled={testingIntegration === section.testType}
                        className={btnPrimary + ' bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/25 disabled:opacity-40'}>
                        {testingIntegration === section.testType ? <><RefreshCw size={13} className="animate-spin" /> Testing...</> : <><Wifi size={13} /> Test Connection</>}
                      </button>
                    </div>
                    {items.map((s: any) => renderSettingRow(s))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

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
  }

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
      case 'mobile_app': return renderMobileApp()
      case 'documentation': return renderDocumentation()
      case 'ai_system': return renderAiSystem()
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
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-t-secondary mt-0.5">Manage your platform configuration, integrations, and branding</p>
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

      {/* Top Tab Navigation — underline style, matches ChatbotSetup */}
      <div className="flex gap-1 border-b border-dark-border overflow-x-auto">
        {TABS.filter(tab => {
          if (tab.superAdminOnly && !isSuperAdmin) return false
          if (tab.feature && !hasFeature(tab.feature)) return false
          if (tab.product && !hasProduct(tab.product)) return false
          return true
        }).map(tab => {
          const Icon = tab.icon
          const active = activeTab === tab.id
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                active ? 'border-primary-500 text-white' : 'border-transparent text-t-secondary hover:text-white'
              }`}>
              <Icon size={14} /> {tab.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      {renderTabContent()}
    </div>
  )
}
