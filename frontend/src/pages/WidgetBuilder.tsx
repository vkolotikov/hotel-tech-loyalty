import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import {
  MessageSquare, Save, Copy, RefreshCw, Check, Eye,
  MessageCircle, HelpCircle, Quote, Headphones, ShoppingBag,
} from 'lucide-react'
import toast from 'react-hot-toast'

const ICON_STYLES = [
  'classic', 'glass', 'solid', 'minimal', 'square',
  'halo', 'midnight', 'duotone', 'aurora', 'neon',
]

const LAUNCHER_SHAPES = [
  { value: 'circle', label: 'Circle' },
  { value: 'rounded-square', label: 'Rounded Square' },
  { value: 'pill', label: 'Pill' },
  { value: 'square', label: 'Square' },
]

const LAUNCHER_ICONS = [
  { value: 'chat', label: 'Chat', icon: MessageSquare },
  { value: 'message', label: 'Message', icon: MessageCircle },
  { value: 'support', label: 'Support', icon: Headphones },
  { value: 'quote', label: 'Quote', icon: Quote },
  { value: 'question', label: 'Question', icon: HelpCircle },
  { value: 'sales', label: 'Sales', icon: ShoppingBag },
]

const COLOR_PRESETS = [
  '#c9a84c', '#2d6a4f', '#1d4ed8', '#7c3aed', '#dc2626',
  '#0891b2', '#ea580c', '#16a34a', '#4f46e5', '#be185d',
]

export function WidgetBuilder() {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)

  const { data: config, isLoading } = useQuery({
    queryKey: ['widget-config'],
    queryFn: () => api.get('/v1/admin/widget-config').then(r => r.data),
  })

  const { data: embedData } = useQuery({
    queryKey: ['widget-embed'],
    queryFn: () => api.get('/v1/admin/widget-config/embed-code').then(r => r.data),
    enabled: !!config?.id,
  })

  const [form, setForm] = useState<any>(null)
  const f = form ?? config ?? {}

  const update = (key: string, value: any) => {
    setForm((prev: any) => ({ ...(prev ?? config ?? {}), [key]: value }))
  }

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/widget-config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widget-config'] })
      qc.invalidateQueries({ queryKey: ['widget-embed'] })
      setForm(null)
      toast.success('Widget config saved')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  const regenKey = useMutation({
    mutationFn: () => api.post('/v1/admin/widget-config/regenerate-key'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widget-config'] })
      qc.invalidateQueries({ queryKey: ['widget-embed'] })
      toast.success('API key regenerated')
    },
  })

  const copyEmbed = () => {
    if (embedData?.embed_code) {
      navigator.clipboard.writeText(embedData.embed_code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast.success('Embed code copied!')
    }
  }

  const launcherIconComponent = LAUNCHER_ICONS.find(i => i.value === (f.launcher_icon || 'chat'))?.icon || MessageSquare

  // Shape CSS
  const shapeStyles: Record<string, string> = {
    'circle': 'rounded-full',
    'rounded-square': 'rounded-xl',
    'pill': 'rounded-full px-6',
    'square': 'rounded-lg',
  }

  const LauncherIcon = launcherIconComponent

  if (isLoading) return <div className="text-center text-[#8e8e93] py-12">Loading...</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="text-primary-500" size={28} />
        <div>
          <h1 className="text-2xl font-bold text-white">Chat Widget Builder</h1>
          <p className="text-sm text-[#8e8e93]">Customize your embeddable chat widget for your hotel website</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ═══ LEFT: Configuration Form ═══ */}
        <div className="lg:col-span-2 space-y-6">

          {/* General */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">General</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-[#8e8e93] mb-1">Company Name</label>
                <input type="text" value={f.company_name || ''} onChange={e => update('company_name', e.target.value)}
                  className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" placeholder="Your Hotel Name" />
              </div>
              <div>
                <label className="block text-sm text-[#8e8e93] mb-1">Position</label>
                <select value={f.position || 'bottom-right'} onChange={e => update('position', e.target.value)}
                  className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm">
                  <option value="bottom-right">Bottom Right</option>
                  <option value="bottom-left">Bottom Left</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-sm text-[#8e8e93] mb-1">Welcome Message</label>
              <textarea value={f.welcome_message || ''} onChange={e => update('welcome_message', e.target.value)} rows={2}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="Hello! How can I help you today?" />
            </div>
            <div>
              <label className="block text-sm text-[#8e8e93] mb-1">Offline Message</label>
              <input type="text" value={f.offline_message || ''} onChange={e => update('offline_message', e.target.value)}
                className="w-full bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
                placeholder="We're currently offline. Leave a message and we'll get back to you." />
            </div>
          </div>

          {/* Appearance */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Appearance</h2>

            {/* Color */}
            <div>
              <label className="block text-sm text-[#8e8e93] mb-2">Brand Color</label>
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  {COLOR_PRESETS.map(c => (
                    <button key={c} onClick={() => update('primary_color', c)}
                      className={`w-7 h-7 rounded-full border-2 transition-all ${(f.primary_color || '#c9a84c') === c ? 'border-white scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                </div>
                <input type="color" value={f.primary_color || '#c9a84c'} onChange={e => update('primary_color', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0" />
                <span className="text-xs text-[#8e8e93] font-mono">{f.primary_color || '#c9a84c'}</span>
              </div>
            </div>

            {/* Icon Style */}
            <div>
              <label className="block text-sm text-[#8e8e93] mb-2">Icon Style</label>
              <div className="grid grid-cols-5 gap-2">
                {ICON_STYLES.map(s => (
                  <button key={s} onClick={() => update('icon_style', s)}
                    className={`py-2 px-3 rounded-lg border text-xs font-medium capitalize transition-colors ${
                      (f.icon_style || 'classic') === s ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-[#8e8e93] hover:border-[#555]'
                    }`}>{s}</button>
                ))}
              </div>
            </div>

            {/* Launcher Shape */}
            <div>
              <label className="block text-sm text-[#8e8e93] mb-2">Launcher Shape</label>
              <div className="flex gap-2">
                {LAUNCHER_SHAPES.map(s => (
                  <button key={s.value} onClick={() => update('launcher_shape', s.value)}
                    className={`flex-1 py-2 px-3 rounded-lg border text-sm transition-colors ${
                      (f.launcher_shape || 'circle') === s.value ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-[#8e8e93] hover:border-[#555]'
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>

            {/* Launcher Icon */}
            <div>
              <label className="block text-sm text-[#8e8e93] mb-2">Launcher Icon</label>
              <div className="grid grid-cols-6 gap-2">
                {LAUNCHER_ICONS.map(i => (
                  <button key={i.value} onClick={() => update('launcher_icon', i.value)}
                    className={`flex flex-col items-center gap-1 py-3 rounded-lg border transition-colors ${
                      (f.launcher_icon || 'chat') === i.value ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-[#8e8e93] hover:border-[#555]'
                    }`}>
                    <i.icon size={18} />
                    <span className="text-xs">{i.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Lead Capture */}
          <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Lead Capture</h2>

            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={f.lead_capture_enabled ?? true}
                  onChange={e => update('lead_capture_enabled', e.target.checked)} className="sr-only peer" />
                <div className="w-11 h-6 bg-[#333] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-primary-600 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
              </label>
              <span className="text-sm text-white">Enable lead capture form</span>
            </div>

            {(f.lead_capture_enabled ?? true) && (
              <>
                <div>
                  <label className="block text-sm text-[#8e8e93] mb-2">Capture Fields</label>
                  <div className="flex gap-4">
                    {['name', 'email', 'phone'].map(field => {
                      const fields = f.lead_capture_fields || { name: true, email: true, phone: false }
                      return (
                        <label key={field} className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={fields[field] ?? false}
                            onChange={e => update('lead_capture_fields', { ...fields, [field]: e.target.checked })}
                            className="w-4 h-4 rounded border-dark-border bg-[#1c1c1e] text-primary-500 focus:ring-primary-500" />
                          <span className="text-sm text-white capitalize">{field}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-[#8e8e93] mb-1">Delay before showing form (seconds)</label>
                  <input type="number" min={0} max={300} value={f.lead_capture_delay ?? 0}
                    onChange={e => update('lead_capture_delay', parseInt(e.target.value) || 0)}
                    className="w-32 bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-white text-sm" />
                </div>
              </>
            )}
          </div>

          {/* Embed Code */}
          {config?.id && (
            <div className="bg-dark-surface border border-dark-border rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-semibold text-white">Embed Code</h2>
              <p className="text-sm text-[#8e8e93]">Copy this code and paste it before the closing <code className="text-primary-400">&lt;/body&gt;</code> tag of your website.</p>

              <div className="bg-[#1c1c1e] rounded-lg p-3 flex items-center gap-2">
                <code className="text-xs text-green-400 flex-1 break-all">{embedData?.embed_code || 'Save config first to generate embed code'}</code>
                <button onClick={copyEmbed} className="text-[#8e8e93] hover:text-white p-1">
                  {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs text-[#555]">
                <span>Widget Key: <code className="text-[#8e8e93]">{config.widget_key}</code></span>
                <span>|</span>
                <button onClick={() => regenKey.mutate()} disabled={regenKey.isPending}
                  className="flex items-center gap-1 text-primary-400 hover:text-primary-300">
                  <RefreshCw size={12} /> Regenerate API Key
                </button>
              </div>
            </div>
          )}

          {/* Save */}
          <div className="flex justify-end gap-3">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={f.is_active ?? true}
                onChange={e => update('is_active', e.target.checked)}
                className="w-4 h-4 rounded border-dark-border bg-[#1c1c1e] text-primary-500" />
              <span className="text-sm text-white">Widget Active</span>
            </label>
            <button onClick={() => saveMutation.mutate(f)} disabled={saveMutation.isPending}
              className="flex items-center gap-2 bg-primary-600 text-white px-6 py-2.5 rounded-lg hover:bg-primary-700 text-sm font-medium disabled:opacity-50">
              <Save size={16} /> {saveMutation.isPending ? 'Saving...' : 'Save Widget Config'}
            </button>
          </div>
        </div>

        {/* ═══ RIGHT: Live Preview ═══ */}
        <div className="lg:col-span-1">
          <div className="sticky top-6 space-y-4">
            <div className="flex items-center gap-2 text-sm text-[#8e8e93]">
              <Eye size={16} />
              <span>Live Preview</span>
            </div>

            {/* Chat Window Preview */}
            <div className="bg-[#0d0d0d] border border-dark-border rounded-xl overflow-hidden" style={{ minHeight: 480 }}>
              {/* Header */}
              <div className="p-4 flex items-center gap-3" style={{ backgroundColor: f.primary_color || '#c9a84c' }}>
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <LauncherIcon size={16} className="text-white" />
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{f.company_name || 'Your Hotel'}</div>
                  <div className="text-white/70 text-xs">Online</div>
                </div>
              </div>

              {/* Messages */}
              <div className="p-4 space-y-3" style={{ minHeight: 280 }}>
                {f.welcome_message && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: f.primary_color || '#c9a84c' }}>
                      <LauncherIcon size={10} className="text-white" />
                    </div>
                    <div className="bg-[#1c1c1e] border border-dark-border rounded-lg rounded-tl-sm px-3 py-2 max-w-[80%]">
                      <p className="text-sm text-white">{f.welcome_message}</p>
                    </div>
                  </div>
                )}

                {/* Sample visitor message */}
                <div className="flex justify-end">
                  <div className="rounded-lg rounded-tr-sm px-3 py-2 max-w-[80%]" style={{ backgroundColor: f.primary_color || '#c9a84c' }}>
                    <p className="text-sm text-white">What are the check-in hours?</p>
                  </div>
                </div>

                {/* Sample AI reply */}
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: f.primary_color || '#c9a84c' }}>
                    <LauncherIcon size={10} className="text-white" />
                  </div>
                  <div className="bg-[#1c1c1e] border border-dark-border rounded-lg rounded-tl-sm px-3 py-2 max-w-[80%]">
                    <p className="text-sm text-white">Check-in is from 3:00 PM and check-out is at 11:00 AM. Early check-in may be available upon request.</p>
                  </div>
                </div>
              </div>

              {/* Input */}
              <div className="p-3 border-t border-dark-border">
                <div className="bg-[#1c1c1e] border border-dark-border rounded-lg px-3 py-2 text-sm text-[#555]">
                  Type a message...
                </div>
              </div>

              {/* Lead Capture Preview */}
              {(f.lead_capture_enabled ?? true) && (
                <div className="p-3 border-t border-dark-border">
                  <div className="text-xs text-[#8e8e93] mb-2">Lead capture form:</div>
                  <div className="space-y-1.5">
                    {(f.lead_capture_fields?.name ?? true) && <div className="bg-[#1c1c1e] border border-dark-border rounded px-2 py-1 text-xs text-[#555]">Name</div>}
                    {(f.lead_capture_fields?.email ?? true) && <div className="bg-[#1c1c1e] border border-dark-border rounded px-2 py-1 text-xs text-[#555]">Email</div>}
                    {(f.lead_capture_fields?.phone ?? false) && <div className="bg-[#1c1c1e] border border-dark-border rounded px-2 py-1 text-xs text-[#555]">Phone</div>}
                  </div>
                </div>
              )}
            </div>

            {/* Launcher Button Preview */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#8e8e93]">Launcher button:</span>
              <button
                className={`w-14 h-14 flex items-center justify-center text-white shadow-lg ${shapeStyles[f.launcher_shape || 'circle'] || 'rounded-full'}`}
                style={{ backgroundColor: f.primary_color || '#c9a84c' }}
              >
                <LauncherIcon size={24} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
