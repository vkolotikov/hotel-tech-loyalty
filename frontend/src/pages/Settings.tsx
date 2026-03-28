import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import { useAuthStore } from '../stores/authStore'
import { Bell, Brain, Cloud, Smartphone, FileText, Database, Save, RefreshCw, Palette, RotateCcw, Upload } from 'lucide-react'
import toast from 'react-hot-toast'

const TIER_COLORS: Record<string, string> = {
  Bronze: '#CD7F32',
  Silver: '#C0C0C0',
  Gold: '#FFD700',
  Platinum: '#6B6B6B',
  Diamond: '#00BCD4',
}

const GROUP_LABELS: Record<string, string> = {
  general: 'General',
  points: 'Points & Rewards',
  notifications: 'Notifications',
  appearance: 'Appearance & Brand Colors',
}

// Color keys get a special color picker UI
const COLOR_KEYS = [
  'primary_color', 'secondary_color', 'accent_color',
  'background_color', 'surface_color', 'text_color',
  'text_secondary_color', 'border_color',
  'error_color', 'warning_color', 'info_color',
]

// Preset themes
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
  'Warm Terracotta': {
    primary_color: '#ea580c', secondary_color: '#1c1412', accent_color: '#84cc16',
    background_color: '#0c0a08', surface_color: '#1c1412', text_color: '#fff7ed',
    text_secondary_color: '#fdba74', border_color: '#3b2314',
    error_color: '#dc2626', warning_color: '#facc15', info_color: '#38bdf8',
  },
  'Midnight Purple': {
    primary_color: '#8b5cf6', secondary_color: '#1a1625', accent_color: '#f472b6',
    background_color: '#0e0b16', surface_color: '#1a1625', text_color: '#f5f3ff',
    text_secondary_color: '#a78bfa', border_color: '#2e1f4d',
    error_color: '#f43f5e', warning_color: '#fbbf24', info_color: '#22d3ee',
  },
  'Classic Light': {
    primary_color: '#2563eb', secondary_color: '#f1f5f9', accent_color: '#16a34a',
    background_color: '#f8fafc', surface_color: '#ffffff', text_color: '#0f172a',
    text_secondary_color: '#64748b', border_color: '#e2e8f0',
    error_color: '#dc2626', warning_color: '#d97706', info_color: '#0284c7',
  },
}

export function Settings() {
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const [editedSettings, setEditedSettings] = useState<Record<string, string>>({})
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)

  const { data: tiersData, isLoading: tiersLoading } = useQuery({
    queryKey: ['admin-tiers'],
    queryFn: () => api.get('/v1/admin/tiers').then(r => r.data),
  })

  const { data: settingsData, isLoading: settingsLoading } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get('/v1/admin/settings').then(r => r.data),
  })

  const saveMutation = useMutation({
    mutationFn: (settings: { key: string; value: any }[]) =>
      api.put('/v1/admin/settings', { settings }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['admin-theme'] })
      setEditedSettings({})
      toast.success('Settings saved — theme updated')
    },
    onError: () => toast.error('Failed to save settings'),
  })

  const logoMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('logo', file)
      return api.post('/v1/admin/settings/logo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-settings'] })
      qc.invalidateQueries({ queryKey: ['settings-logo'] })
      setLogoPreview(null)
      toast.success('Logo uploaded successfully')
    },
    onError: () => toast.error('Failed to upload logo'),
  })

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => setLogoPreview(reader.result as string)
      reader.readAsDataURL(file)
      logoMutation.mutate(file)
    }
  }

  const handleChange = (key: string, value: string) => {
    setEditedSettings(prev => ({ ...prev, [key]: value }))
  }

  const handleSave = () => {
    const settings = Object.entries(editedSettings).map(([key, value]) => ({ key, value }))
    if (settings.length > 0) saveMutation.mutate(settings)
  }

  const applyPreset = (presetName: string) => {
    const preset = PRESETS[presetName]
    if (!preset) return
    setEditedSettings(prev => ({ ...prev, ...preset }))
    toast.success(`Applied "${presetName}" preset — click Save to apply`)
  }

  // Get live value (edited or current)
  const getSettingValue = (key: string, allSettings: any): string => {
    if (editedSettings[key] !== undefined) return editedSettings[key]
    for (const group of Object.values(allSettings)) {
      const found = (group as any[]).find((s: any) => s.key === key)
      if (found) return String(found.value ?? '')
    }
    return ''
  }

  const hasChanges = Object.keys(editedSettings).length > 0
  const allSettings = settingsData?.settings ?? {}

  // Get current company logo URL from settings
  const currentLogoUrl = resolveImage(getSettingValue('company_logo', allSettings) || null)

  // Live preview colors
  const previewPrimary = getSettingValue('primary_color', allSettings) || '#c9a84c'
  const previewBg = getSettingValue('background_color', allSettings) || '#0d0d0d'
  const previewSurface = getSettingValue('surface_color', allSettings) || '#161616'
  const previewText = getSettingValue('text_color', allSettings) || '#ffffff'
  const previewText2 = getSettingValue('text_secondary_color', allSettings) || '#8e8e93'
  const previewBorder = getSettingValue('border_color', allSettings) || '#2c2c2c'
  const previewAccent = getSettingValue('accent_color', allSettings) || '#32d74b'
  const previewError = getSettingValue('error_color', allSettings) || '#ff375f'

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
          <p className="text-sm text-[#8e8e93] mt-1">System configuration and brand customization</p>
        </div>
        {hasChanges && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditedSettings({})}
              className="flex items-center gap-2 text-[#8e8e93] hover:text-white px-4 py-2 rounded-lg text-sm border border-dark-border"
            >
              <RotateCcw size={15} /> Discard
            </button>
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {saveMutation.isPending ? <RefreshCw size={15} className="animate-spin" /> : <Save size={15} />}
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* Account Info */}
      <div className="bg-dark-surface rounded-xl border border-dark-border p-6">
        <h2 className="text-base font-bold text-white mb-4">Logged In As</h2>
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-500/20 flex items-center justify-center">
            <span className="text-lg font-bold text-primary-400">{user?.name?.charAt(0) ?? 'A'}</span>
          </div>
          <div>
            <p className="font-semibold text-white">{user?.name}</p>
            <p className="text-sm text-[#8e8e93]">{user?.email}</p>
            <span className="inline-flex px-2 py-0.5 mt-1 rounded-full text-xs font-semibold bg-primary-500/20 text-primary-400">
              {(user as any)?.staff?.role?.replace('_', ' ').toUpperCase() ?? 'ADMIN'}
            </span>
          </div>
        </div>
      </div>

      {/* Company Logo */}
      <div className="bg-dark-surface rounded-xl border border-dark-border p-6">
        <h2 className="text-base font-bold text-white mb-4">Company Logo</h2>
        <p className="text-sm text-[#8e8e93] mb-4">This logo appears in the app header, member cards, and email notifications.</p>
        <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
        <div className="flex items-center gap-6">
          <div className="flex-shrink-0">
            {logoPreview || currentLogoUrl ? (
              <div className="relative group">
                <img
                  src={logoPreview || currentLogoUrl!}
                  alt="Company Logo"
                  className="h-20 max-w-[200px] object-contain rounded-lg border border-dark-border bg-dark-bg p-2"
                />
                <div
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  onClick={() => logoInputRef.current?.click()}
                >
                  <Upload size={20} className="text-white" />
                </div>
              </div>
            ) : (
              <div
                className="h-20 w-40 rounded-lg border-2 border-dashed border-dark-border2 flex items-center justify-center cursor-pointer hover:border-primary-500 transition-colors"
                onClick={() => logoInputRef.current?.click()}
              >
                <div className="text-center">
                  <Upload size={20} className="mx-auto text-[#636366] mb-1" />
                  <span className="text-xs text-[#636366]">Upload Logo</span>
                </div>
              </div>
            )}
          </div>
          <div className="space-y-2">
            <button
              onClick={() => logoInputRef.current?.click()}
              disabled={logoMutation.isPending}
              className="flex items-center gap-2 bg-primary-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
            >
              {logoMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
              {logoMutation.isPending ? 'Uploading...' : (currentLogoUrl ? 'Change Logo' : 'Upload Logo')}
            </button>
            <p className="text-xs text-[#636366]">PNG, JPG, SVG or WebP. Max 4MB.</p>
          </div>
        </div>
      </div>

      {/* Settings by Group */}
      {settingsLoading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => (
            <div key={i} className="bg-dark-surface rounded-xl border border-dark-border p-6 animate-pulse">
              <div className="h-5 bg-dark-surface2 rounded w-32 mb-4" />
              <div className="space-y-3">
                <div className="h-10 bg-dark-surface2 rounded" />
                <div className="h-10 bg-dark-surface2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        Object.entries(allSettings).map(([group, items]: [string, any]) => (
          <div key={group} className="bg-dark-surface rounded-xl border border-dark-border p-6">
            <h2 className="text-base font-bold text-white mb-4 flex items-center gap-2">
              {group === 'appearance' && <Palette size={18} className="text-primary-400" />}
              {GROUP_LABELS[group] ?? group}
            </h2>

            {/* Preset selector for appearance group */}
            {group === 'appearance' && (
              <div className="mb-6">
                <p className="text-sm text-[#8e8e93] mb-3">Quick presets — select a theme to get started, then customize individual colors</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PRESETS).map(([name, colors]) => (
                    <button
                      key={name}
                      onClick={() => applyPreset(name)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dark-border hover:border-primary-500 transition-colors group"
                    >
                      <div className="flex -space-x-1">
                        <div className="w-4 h-4 rounded-full border border-dark-bg" style={{ backgroundColor: colors.primary_color }} />
                        <div className="w-4 h-4 rounded-full border border-dark-bg" style={{ backgroundColor: colors.background_color }} />
                        <div className="w-4 h-4 rounded-full border border-dark-bg" style={{ backgroundColor: colors.accent_color }} />
                      </div>
                      <span className="text-xs text-[#8e8e93] group-hover:text-white transition-colors">{name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-4">
              {(items as any[]).map((setting: any) => {
                const isColor = COLOR_KEYS.includes(setting.key)
                const currentVal = editedSettings[setting.key] ?? String(setting.value ?? '')

                return (
                  <div key={setting.key} className="flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <label className="block text-sm font-medium text-[#e0e0e0] mb-0.5">{setting.label}</label>
                      {setting.description && (
                        <p className="text-xs text-[#636366] mb-1">{setting.description}</p>
                      )}
                    </div>
                    <div className="w-64 flex-shrink-0">
                      {isColor ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={currentVal || '#000000'}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            className="w-10 h-10 rounded-lg border border-dark-border cursor-pointer bg-transparent p-0.5"
                          />
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => handleChange(setting.key, e.target.value)}
                            placeholder="#000000"
                            maxLength={7}
                            className="flex-1 bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                          />
                        </div>
                      ) : setting.type === 'boolean' ? (
                        <button
                          onClick={() => {
                            const current = editedSettings[setting.key] ?? String(setting.value)
                            handleChange(setting.key, current === 'true' || current === '1' ? 'false' : 'true')
                          }}
                          className={`relative w-12 h-6 rounded-full transition-colors ${
                            (editedSettings[setting.key] ?? String(setting.value)) === 'true' || (editedSettings[setting.key] ?? String(setting.value)) === '1'
                              ? 'bg-[#32d74b]'
                              : 'bg-dark-surface3'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                              (editedSettings[setting.key] ?? String(setting.value)) === 'true' || (editedSettings[setting.key] ?? String(setting.value)) === '1'
                                ? 'translate-x-6'
                                : 'translate-x-0.5'
                            }`}
                          />
                        </button>
                      ) : setting.type === 'integer' ? (
                        <input
                          type="number"
                          value={currentVal}
                          onChange={(e) => handleChange(setting.key, e.target.value)}
                          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      ) : (
                        <input
                          type="text"
                          value={currentVal}
                          onChange={(e) => handleChange(setting.key, e.target.value)}
                          className="w-full bg-[#1e1e1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Live preview for appearance group */}
            {group === 'appearance' && (
              <div className="mt-6 pt-6 border-t border-dark-border">
                <h3 className="text-sm font-semibold text-[#8e8e93] mb-3">Live Preview</h3>
                <div className="rounded-xl overflow-hidden border" style={{ borderColor: previewBorder, backgroundColor: previewBg }}>
                  {/* Mock header */}
                  <div className="px-4 py-3 flex items-center gap-3" style={{ backgroundColor: previewSurface, borderBottom: `1px solid ${previewBorder}` }}>
                    <div className="w-6 h-6 rounded flex items-center justify-center" style={{ backgroundColor: previewPrimary }}>
                      <span style={{ color: previewBg, fontSize: 10, fontWeight: 700 }}>H</span>
                    </div>
                    <span style={{ color: previewText, fontSize: 13, fontWeight: 600 }}>Hotel Loyalty</span>
                    <div className="flex-1" />
                    <span style={{ color: previewText2, fontSize: 11 }}>Admin</span>
                  </div>
                  {/* Mock content */}
                  <div className="p-4 space-y-3">
                    <div className="flex gap-3">
                      {['Dashboard', 'Members', 'Offers'].map((label, i) => (
                        <div
                          key={label}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium"
                          style={{
                            backgroundColor: i === 0 ? previewPrimary + '20' : 'transparent',
                            color: i === 0 ? previewPrimary : previewText2,
                          }}
                        >{label}</div>
                      ))}
                    </div>
                    <div className="rounded-lg p-3" style={{ backgroundColor: previewSurface, border: `1px solid ${previewBorder}` }}>
                      <p style={{ color: previewText, fontSize: 13, fontWeight: 600 }}>Active Members</p>
                      <p style={{ color: previewPrimary, fontSize: 20, fontWeight: 700 }}>1,247</p>
                      <p style={{ color: previewText2, fontSize: 11 }}>+12% from last month</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewPrimary, color: previewBg }}>
                        Primary Button
                      </div>
                      <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewAccent + '20', color: previewAccent }}>
                        Success
                      </div>
                      <div className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: previewError + '20', color: previewError }}>
                        Error
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))
      )}

      {/* System Info */}
      <div className="bg-dark-surface rounded-xl border border-dark-border p-6">
        <h2 className="text-base font-bold text-white mb-4">System Information</h2>
        <dl className="space-y-3">
          <div className="flex justify-between py-2 border-b border-dark-border">
            <dt className="text-sm text-[#8e8e93]">API URL</dt>
            <dd className="text-sm font-mono text-white">{import.meta.env.VITE_API_URL ?? 'localhost'}</dd>
          </div>
          <div className="flex justify-between py-2 border-b border-dark-border">
            <dt className="text-sm text-[#8e8e93]">App Version</dt>
            <dd className="text-sm font-semibold text-white">v1.0.0</dd>
          </div>
          <div className="flex justify-between py-2 border-b border-dark-border">
            <dt className="text-sm text-[#8e8e93]">Stack</dt>
            <dd className="text-sm text-white">Laravel + React + Expo</dd>
          </div>
          <div className="flex justify-between py-2">
            <dt className="text-sm text-[#8e8e93]">AI Model</dt>
            <dd className="text-sm font-semibold text-[#32d74b]">GPT-4o</dd>
          </div>
        </dl>
      </div>

      {/* Loyalty Tiers */}
      <div className="bg-dark-surface rounded-xl border border-dark-border p-6">
        <h2 className="text-base font-bold text-white mb-4">Loyalty Tier Configuration</h2>
        {tiersLoading ? (
          <div className="space-y-3">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-20 bg-dark-surface2 rounded-xl animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {(tiersData?.tiers ?? []).map((tier: any) => (
              <div key={tier.id} className="border border-dark-border rounded-xl p-4 hover:bg-dark-surface2 transition-colors">
                <div className="flex items-center gap-4 mb-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: tier.color_hex ?? TIER_COLORS[tier.name] ?? '#94a3b8' }}
                  >
                    {tier.icon ?? tier.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-white">{tier.name}</h3>
                      <span className="text-xs bg-dark-surface3 text-[#a0a0a0] px-2 py-0.5 rounded-full font-medium">
                        {tier.member_count} members
                      </span>
                    </div>
                    <p className="text-xs text-[#8e8e93]">
                      {tier.min_points.toLocaleString()} – {tier.max_points ? tier.max_points.toLocaleString() : '\u221E'} pts lifetime
                      &nbsp;·&nbsp; <strong>{tier.earn_rate}x</strong> earn rate
                    </p>
                  </div>
                </div>
                {tier.perks && tier.perks.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 ml-14">
                    {tier.perks.map((perk: string, i: number) => (
                      <span key={i} className="text-xs bg-[#32d74b]/15 text-[#32d74b] px-2 py-0.5 rounded-full">
                        {perk}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Links */}
      <div className="bg-dark-surface rounded-xl border border-dark-border p-6">
        <h2 className="text-base font-bold text-white mb-4">Quick Links</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: 'Firebase Console', icon: <Bell size={18} />, desc: 'Push notifications' },
            { label: 'OpenAI Platform', icon: <Brain size={18} />, desc: 'API usage & billing' },
            { label: 'DigitalOcean', icon: <Cloud size={18} />, desc: 'Server management' },
            { label: 'Expo Dashboard', icon: <Smartphone size={18} />, desc: 'Mobile builds' },
            { label: 'Laravel Logs', icon: <FileText size={18} />, desc: 'storage/logs/laravel.log' },
            { label: 'WAMP Admin', icon: <Database size={18} />, desc: 'Database management' },
          ].map(link => (
            <div key={link.label} className="flex items-start gap-3 p-3 rounded-lg border border-dark-border hover:bg-dark-surface2 transition-colors cursor-default">
              <div className="text-primary-400 mt-0.5">{link.icon}</div>
              <div>
                <p className="text-sm font-semibold text-white">{link.label}</p>
                <p className="text-xs text-[#636366]">{link.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
