import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, resolveImage } from '../lib/api'
import {
  Save, RefreshCw, Upload, Trash2, Copy, Check, Code, MessageSquare,
  Palette, Type, Mic, Volume2, Clock, Shield, UserCheck, Megaphone,
  Send, Phone, X, MessageCircle, Headphones, HelpCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'

type SubTab = 'appearance' | 'copy' | 'behavior' | 'voice' | 'install'

const SUB_TABS: { key: SubTab; label: string; icon: any }[] = [
  { key: 'appearance', label: 'Appearance',  icon: Palette },
  { key: 'copy',       label: 'Copy & Avatar', icon: Type },
  { key: 'behavior',   label: 'Behavior',    icon: UserCheck },
  { key: 'voice',      label: 'Voice Agent', icon: Mic },
  { key: 'install',    label: 'Install',     icon: Code },
]

const LAUNCHER_ICON_MAP: Record<string, any> = {
  chat:     MessageSquare,
  message:  MessageCircle,
  support:  Headphones,
  question: HelpCircle,
  sales:    Megaphone,
}

const COLOR_PRESETS = ['#c9a84c', '#2d6a4f', '#1d4ed8', '#7c3aed', '#dc2626', '#0891b2', '#ea580c', '#16a34a', '#4f46e5', '#be185d']
const FONT_OPTIONS = ['Inter', 'Roboto', 'Open Sans', 'Lato', 'Poppins', 'Montserrat', 'Nunito', 'Playfair Display', 'Georgia', 'system-ui']
const LAUNCHER_SHAPES = ['circle', 'rounded-square', 'pill', 'square'] as const
const LAUNCHER_ICONS = ['chat', 'message', 'support', 'question', 'sales'] as const
const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse']

const STORAGE_KEY = 'loyalty-chatbot-widget-tab'

const card = 'bg-dark-card border border-dark-border rounded-xl p-5 space-y-4'
const cardTitle = 'text-sm font-semibold text-white flex items-center gap-2'
const label = 'block text-xs text-t-secondary mb-1'
const input = 'w-full bg-dark-bg border border-dark-border rounded-lg px-3 py-2 text-sm text-white placeholder-[#636366] focus:border-primary-500 outline-none'
const btnSec = 'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-dark-bg border border-dark-border text-t-secondary rounded-lg hover:text-white'

export function ChatbotWidget() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<SubTab>(() => {
    const saved = (typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY)) as string | null
    if (saved === 'brand' || saved === 'style') return 'appearance'
    return (saved && SUB_TABS.some(t => t.key === saved)) ? (saved as SubTab) : 'appearance'
  })
  const switchTab = (next: SubTab) => {
    setTab(next)
    try { localStorage.setItem(STORAGE_KEY, next) } catch { /* ignore */ }
  }

  // ─── Widget Config ───────────────────────────────────────────────────────
  const { data: config, isLoading } = useQuery({
    queryKey: ['widget-config'],
    queryFn: () => api.get('/v1/admin/widget-config').then(r => r.data),
  })

  const { data: embed } = useQuery({
    queryKey: ['widget-embed'],
    queryFn: () => api.get('/v1/admin/widget-config/embed-code').then(r => r.data),
    enabled: !!config?.id,
  })

  const [form, setForm] = useState<any>(null)
  const f = form ?? config ?? {}
  const update = (key: string, value: any) =>
    setForm((prev: any) => ({ ...(prev ?? config ?? {}), [key]: value }))
  const dirty = form !== null

  const saveMutation = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/widget-config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widget-config'] })
      qc.invalidateQueries({ queryKey: ['widget-embed'] })
      setForm(null)
      toast.success('Widget config saved')
    },
    onError: (e: any) => toast.error(e.response?.data?.error || e.response?.data?.message || 'Save failed'),
  })

  const regenKey = useMutation({
    mutationFn: () => api.post('/v1/admin/widget-config/regenerate-key'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['widget-config'] })
      qc.invalidateQueries({ queryKey: ['widget-embed'] })
      toast.success('API key regenerated')
    },
  })

  const avatarInputRef = useRef<HTMLInputElement>(null)
  const avatarUpload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return api.post('/v1/admin/widget-config/upload-avatar', fd).then(r => r.data)
    },
    onSuccess: (data: any) => {
      update('assistant_avatar_url', data.assistant_avatar_url)
      qc.invalidateQueries({ queryKey: ['widget-config'] })
      toast.success('Avatar uploaded')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Upload failed'),
  })

  // ─── Voice Agent Config ──────────────────────────────────────────────────
  const { data: voiceConfig } = useQuery({
    queryKey: ['voice-agent-config'],
    queryFn: () => api.get('/v1/admin/voice-agent/config').then(r => r.data),
  })
  const [voiceForm, setVoiceForm] = useState<any>(null)
  const v = voiceForm ?? voiceConfig ?? {}
  const updateVoice = (key: string, value: any) =>
    setVoiceForm((prev: any) => ({ ...(prev ?? voiceConfig ?? {}), [key]: value }))
  const voiceDirty = voiceForm !== null

  const voiceSave = useMutation({
    mutationFn: (data: any) => api.put('/v1/admin/voice-agent/config', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['voice-agent-config'] })
      setVoiceForm(null)
      toast.success('Voice config saved')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Save failed'),
  })

  // ─── Embed copy state ────────────────────────────────────────────────────
  const [embedTab, setEmbedTab] = useState<'script' | 'iframe' | 'api'>('script')
  const [copied, setCopied] = useState('')
  const copyCode = (text?: string, key = 'main') => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
    toast.success('Copied')
  }

  if (isLoading) return <div className="text-center text-[#636366] py-12">Loading...</div>

  // ─── Render helpers ──────────────────────────────────────────────────────
  const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only peer" />
      <div className="w-10 h-5 bg-dark-bg border border-dark-border peer-focus:outline-none rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1px] after:left-[1px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
    </label>
  )

  // ─── Sub-tab content ─────────────────────────────────────────────────────

  const renderAppearance = () => (
    <div className="space-y-4">
      {/* Identity */}
      <div className={card}>
        <h3 className={cardTitle}><Palette size={14} className="text-primary-500" /> Identity</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Company Name</label>
            <input type="text" value={f.company_name || ''} onChange={e => update('company_name', e.target.value)}
              className={input} placeholder="Your Hotel Name" />
          </div>
          <div>
            <label className={label}>Position on Page</label>
            <select value={f.position || 'bottom-right'} onChange={e => update('position', e.target.value)} className={input}>
              <option value="bottom-right">Bottom Right</option>
              <option value="bottom-left">Bottom Left</option>
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Brand Color</label>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 flex-wrap">
              {COLOR_PRESETS.map(c => (
                <button key={c} onClick={() => update('primary_color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${(f.primary_color || '#c9a84c') === c ? 'border-white scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <input type="color" value={f.primary_color || '#c9a84c'} onChange={e => update('primary_color', e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border-0" />
            <span className="text-xs text-t-secondary font-mono">{f.primary_color || '#c9a84c'}</span>
          </div>
        </div>

        <div>
          <label className={label}>Agent Status (shown to visitors as a status dot)</label>
          <div className="flex gap-2">
            {[
              { v: 'online',  label: 'Online',  color: '#10b981' },
              { v: 'away',    label: 'Away',    color: '#f59e0b' },
              { v: 'offline', label: 'Offline', color: '#6b7280' },
            ].map(s => (
              <button key={s.v} type="button" onClick={() => update('agent_status', s.v)}
                className={`flex-1 py-2 px-3 rounded-lg border text-xs flex items-center justify-center gap-2 ${
                  (f.agent_status || 'online') === s.v ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-t-secondary hover:border-dark-border2'
                }`}>
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-dark-border">
          <Toggle checked={f.is_active ?? true} onChange={v => update('is_active', v)} />
          <span className="text-sm text-white">Widget is live on the website</span>
        </div>
      </div>

      {/* Launcher button */}
      <div className={card}>
        <h3 className={cardTitle}><MessageSquare size={14} className="text-primary-500" /> Launcher Button</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Shape</label>
            <div className="flex gap-2">
              {LAUNCHER_SHAPES.map(s => (
                <button key={s} onClick={() => update('launcher_shape', s)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs capitalize ${
                    (f.launcher_shape || 'circle') === s ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-t-secondary'
                  }`}>{s.replace('-', ' ')}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Icon</label>
            <div className="flex gap-2">
              {LAUNCHER_ICONS.map(i => {
                const IconCmp = LAUNCHER_ICON_MAP[i] || MessageSquare
                const active = (f.launcher_icon || 'chat') === i
                return (
                  <button key={i} type="button" onClick={() => update('launcher_icon', i)}
                    title={i}
                    className={`flex-1 py-2 rounded-lg border flex items-center justify-center ${
                      active ? 'border-primary-500 bg-primary-500/10 text-primary-500' : 'border-dark-border text-t-secondary hover:text-white'
                    }`}>
                    <IconCmp size={16} />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <div>
          <label className={label}>Launcher Size: {f.launcher_size || 56}px</label>
          <input type="range" min={40} max={80} step={2} value={f.launcher_size || 56}
            onChange={e => update('launcher_size', parseInt(e.target.value))}
            className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer accent-primary-500" />
        </div>
      </div>

      {/* Chat colors */}
      <div className={card}>
        <h3 className={cardTitle}><Palette size={14} className="text-primary-500" /> Chat Colors</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {([
            { key: 'header_text_color', label: 'Header Text', def: '#ffffff' },
            { key: 'user_bubble_color', label: 'User Bubble', def: f.primary_color || '#c9a84c' },
            { key: 'user_bubble_text', label: 'User Bubble Text', def: '#ffffff' },
            { key: 'bot_bubble_color', label: 'Bot Bubble', def: '#f3f4f6' },
            { key: 'bot_bubble_text', label: 'Bot Bubble Text', def: '#1f2937' },
            { key: 'chat_bg_color', label: 'Chat Background', def: '#ffffff' },
          ] as { key: string; label: string; def: string }[]).map(c => (
            <div key={c.key}>
              <label className={label}>{c.label}</label>
              <div className="flex items-center gap-2">
                <input type="color" value={f[c.key] || c.def || '#000000'} onChange={e => update(c.key, e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-dark-border bg-transparent" />
                <input type="text" value={f[c.key] || ''} placeholder={c.def || 'auto'} onChange={e => update(c.key, e.target.value)}
                  className="flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1.5 text-[11px] text-white font-mono" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Typography & layout */}
      <div className={card}>
        <h3 className={cardTitle}><Type size={14} className="text-primary-500" /> Typography & Layout</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Font Family</label>
            <select value={f.font_family || 'Inter'} onChange={e => update('font_family', e.target.value)} className={input}>
              {FONT_OPTIONS.map(font => <option key={font} value={font}>{font}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Border Radius: {f.border_radius ?? 16}px</label>
            <input type="range" min={0} max={24} step={1} value={f.border_radius ?? 16}
              onChange={e => update('border_radius', parseInt(e.target.value))}
              className="w-full h-2 bg-dark-border rounded-lg appearance-none cursor-pointer accent-primary-500 mt-3" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Header Style</label>
            <div className="flex gap-2">
              {['solid', 'gradient'].map(s => (
                <button key={s} onClick={() => update('header_style', s)}
                  className={`flex-1 py-1.5 rounded-lg border text-xs capitalize ${
                    (f.header_style || 'solid') === s ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-t-secondary'
                  }`}>{s}</button>
              ))}
            </div>
          </div>
          {(f.header_style || 'solid') === 'gradient' && (
            <div>
              <label className={label}>Header Gradient End Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={f.header_gradient_end || f.primary_color || '#c9a84c'}
                  onChange={e => update('header_gradient_end', e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-dark-border" />
                <input type="text" value={f.header_gradient_end || ''} onChange={e => update('header_gradient_end', e.target.value)}
                  className="flex-1 bg-dark-bg border border-dark-border rounded px-2 py-1.5 text-[11px] text-white font-mono"
                  placeholder="#7c3aed" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderCopy = () => (
    <div className="space-y-4">
      <div className={card}>
        <h3 className={cardTitle}><Type size={14} className="text-primary-500" /> Header & Welcome</h3>
        <p className="text-[11px] text-t-secondary -mt-1">All visible text. Leave blank for sensible defaults.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Header Title</label>
            <input type="text" value={f.header_title || ''} onChange={e => update('header_title', e.target.value)}
              className={input} placeholder="AI Assistant" />
          </div>
          <div>
            <label className={label}>Header Subtitle</label>
            <input type="text" value={f.header_subtitle || ''} onChange={e => update('header_subtitle', e.target.value)}
              className={input} placeholder="Ask me anything" />
          </div>
        </div>
        <div>
          <label className={label}>Welcome Heading</label>
          <input type="text" value={f.welcome_title || ''} onChange={e => update('welcome_title', e.target.value)}
            className={input} placeholder="Hi! How can I help you today?" />
        </div>
        <div>
          <label className={label}>Welcome Description</label>
          <textarea value={f.welcome_subtitle || ''} onChange={e => update('welcome_subtitle', e.target.value)} rows={2}
            className={input} placeholder="Ask about reservations, loyalty program, hotel services, or anything else." />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Input Placeholder</label>
            <input type="text" value={f.input_placeholder || ''} onChange={e => update('input_placeholder', e.target.value)}
              className={input} placeholder="Type a message..." />
          </div>
          <div>
            <label className={label}>Input Hint</label>
            <input type="text" value={f.input_hint_text || ''} onChange={e => update('input_hint_text', e.target.value)}
              className={input} placeholder="Press Enter to send" />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2 border-t border-dark-border">
          <Toggle checked={f.show_branding ?? true} onChange={v => update('show_branding', v)} />
          <span className="text-sm text-white">Show "Powered by" branding</span>
        </div>
        {(f.show_branding ?? true) && (
          <div>
            <label className={label}>Branding Footer Text</label>
            <input type="text" value={f.branding_text || ''} onChange={e => update('branding_text', e.target.value)}
              className={input} placeholder="Powered by Hotel AI" />
          </div>
        )}
      </div>

      <div className={card}>
        <h3 className={cardTitle}><MessageSquare size={14} className="text-primary-500" /> Assistant Avatar</h3>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-dark-border bg-dark-bg flex items-center justify-center overflow-hidden shrink-0">
            {f.assistant_avatar_url ? (
              <img src={resolveImage(f.assistant_avatar_url) || f.assistant_avatar_url} alt=""
                className="w-full h-full object-cover"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; (e.target as HTMLImageElement).parentElement!.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#636366" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>'; }} />
            ) : (
              <MessageSquare size={22} className="text-[#636366]" />
            )}
          </div>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex gap-2">
              <button type="button" onClick={() => avatarInputRef.current?.click()} disabled={avatarUpload.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-500 text-black rounded-lg disabled:opacity-50">
                <Upload size={12} /> {avatarUpload.isPending ? 'Uploading...' : 'Upload Image'}
              </button>
              {f.assistant_avatar_url && (
                <button type="button" onClick={() => update('assistant_avatar_url', '')} className={btnSec}>
                  <Trash2 size={12} /> Remove
                </button>
              )}
            </div>
            <input type="url" value={f.assistant_avatar_url || ''} onChange={e => update('assistant_avatar_url', e.target.value)}
              className="w-full bg-dark-bg border border-dark-border rounded px-2 py-1 text-[11px] text-white font-mono"
              placeholder="…or paste image URL" />
          </div>
        </div>
        <input ref={avatarInputRef} type="file" accept="image/*" className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) avatarUpload.mutate(file)
            e.target.value = ''
          }} />
        <p className="text-[10px] text-[#636366]">Square PNG/JPG, ~120×120px, max 2MB.</p>
      </div>

      <div className={card}>
        <h3 className={cardTitle}><Megaphone size={14} className="text-primary-500" /> Suggested Questions</h3>
        <div className="flex items-center justify-between -mt-1">
          <p className="text-[11px] text-t-secondary">Quick-reply buttons shown on the welcome screen. Up to 6.</p>
          <Toggle checked={f.show_suggestions ?? true} onChange={v => update('show_suggestions', v)} />
        </div>
        {(f.show_suggestions ?? true) && (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4, 5].map(i => {
              const list: string[] = Array.isArray(f.suggestions) ? f.suggestions : []
              return (
                <input key={i} type="text" value={list[i] || ''}
                  onChange={e => {
                    const next = [...list]
                    next[i] = e.target.value
                    while (next.length && !next[next.length - 1]) next.pop()
                    update('suggestions', next)
                  }}
                  className={input}
                  placeholder={`Suggestion ${i + 1}`} />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )

  const renderBehavior = () => (
    <div className="space-y-4">
      <div className={card}>
        <h3 className={cardTitle}><UserCheck size={14} className="text-primary-500" /> Lead Capture</h3>
        <div className="flex items-center gap-3">
          <Toggle checked={f.lead_capture_enabled ?? true} onChange={v => update('lead_capture_enabled', v)} />
          <span className="text-sm text-white">Show lead capture form</span>
        </div>
        {(f.lead_capture_enabled ?? true) && (
          <>
            <div>
              <label className={label}>Fields to capture</label>
              <div className="flex gap-4">
                {['name', 'email', 'phone'].map(field => {
                  const fields = f.lead_capture_fields || { name: true, email: true, phone: false }
                  return (
                    <label key={field} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={fields[field] ?? false}
                        onChange={e => update('lead_capture_fields', { ...fields, [field]: e.target.checked })}
                        className="w-4 h-4 rounded border-dark-border bg-dark-bg text-primary-500" />
                      <span className="text-sm text-white capitalize">{field}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div>
              <label className={label}>Delay before showing form: {f.lead_capture_delay ?? 0}s</label>
              <input type="range" min={0} max={300} step={5} value={f.lead_capture_delay ?? 0}
                onChange={e => update('lead_capture_delay', parseInt(e.target.value))}
                className="w-full h-1.5 bg-dark-bg rounded-lg appearance-none cursor-pointer accent-primary-500" />
            </div>
          </>
        )}
      </div>

      <div className={card}>
        <h3 className={cardTitle}><Clock size={14} className="text-primary-500" /> Business Hours & Offline</h3>
        <p className="text-[11px] text-t-secondary -mt-1">When closed, the widget shows your offline message instead of the welcome bubble.</p>
        <div>
          <label className={label}>Timezone (IANA, e.g. Europe/London)</label>
          <input type="text" value={f.timezone || ''} onChange={e => update('timezone', e.target.value)}
            className={input + ' font-mono'} placeholder="Europe/London — leave blank to use server" />
        </div>
        <div className="space-y-2">
          {[
            { key: 'mon', label: 'Mon' }, { key: 'tue', label: 'Tue' }, { key: 'wed', label: 'Wed' },
            { key: 'thu', label: 'Thu' }, { key: 'fri', label: 'Fri' }, { key: 'sat', label: 'Sat' }, { key: 'sun', label: 'Sun' },
          ].map(day => {
            const hours = (f.business_hours || {}) as Record<string, Array<{ open: string; close: string }>>
            const slots = hours[day.key] || []
            const slot = slots[0] || { open: '', close: '' }
            const isOpen = !!(slot.open && slot.close)
            return (
              <div key={day.key} className="flex items-center gap-3">
                <label className="w-12 text-xs text-white">{day.label}</label>
                <Toggle checked={isOpen} onChange={v => {
                  const next = { ...hours }
                  if (v) next[day.key] = [{ open: '09:00', close: '17:00' }]
                  else delete next[day.key]
                  update('business_hours', next)
                }} />
                {isOpen && (
                  <>
                    <input type="time" value={slot.open}
                      onChange={e => update('business_hours', { ...hours, [day.key]: [{ ...slot, open: e.target.value }] })}
                      className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white" />
                    <span className="text-xs text-t-secondary">to</span>
                    <input type="time" value={slot.close}
                      onChange={e => update('business_hours', { ...hours, [day.key]: [{ ...slot, close: e.target.value }] })}
                      className="bg-dark-bg border border-dark-border rounded px-2 py-1 text-xs text-white" />
                  </>
                )}
                {!isOpen && <span className="text-xs text-[#636366]">Closed</span>}
              </div>
            )
          })}
        </div>
        <div>
          <label className={label}>Offline Message</label>
          <input type="text" value={f.offline_message || ''} onChange={e => update('offline_message', e.target.value)}
            className={input} placeholder="We're currently offline. Leave a message and we'll get back to you." />
        </div>
      </div>

      <div className={card}>
        <h3 className={cardTitle}><Shield size={14} className="text-primary-500" /> Privacy & Notifications</h3>
        <div className="flex items-center gap-3">
          <Toggle checked={f.gdpr_consent_required ?? false} onChange={v => update('gdpr_consent_required', v)} />
          <span className="text-sm text-white">Require GDPR consent before chat starts</span>
        </div>
        {(f.gdpr_consent_required ?? false) && (
          <div>
            <label className={label}>Consent text shown to visitors</label>
            <textarea value={f.gdpr_consent_text || ''} onChange={e => update('gdpr_consent_text', e.target.value)} rows={2}
              className={input} placeholder="By chatting with us you agree to our privacy policy." />
          </div>
        )}
        <div className="flex items-center gap-3">
          <Toggle checked={f.rating_prompt_enabled ?? false} onChange={v => update('rating_prompt_enabled', v)} />
          <span className="text-sm text-white">Ask visitors to rate the chat after resolution</span>
        </div>
        {(f.rating_prompt_enabled ?? false) && (
          <div>
            <label className={label}>Rating prompt text</label>
            <input type="text" value={f.rating_prompt_text || ''} onChange={e => update('rating_prompt_text', e.target.value)}
              className={input} placeholder="How was your chat experience?" />
          </div>
        )}
        <div className="flex items-center gap-3 pt-2 border-t border-dark-border">
          <Toggle checked={f.inbox_sound_enabled ?? true} onChange={v => update('inbox_sound_enabled', v)} />
          <span className="text-sm text-white">Play notification sound in agent inbox</span>
        </div>
      </div>
    </div>
  )

  const renderVoice = () => (
    <div className="space-y-4">
      <div className={card}>
        <h3 className={cardTitle}><Mic size={14} className="text-primary-500" /> Voice Agent (AI Voice-to-Voice)</h3>
        <p className="text-[11px] text-t-secondary -mt-1">Real-time voice conversations using OpenAI Realtime API. Visitors can talk to your AI assistant via WebRTC.</p>

        <div className="flex items-center gap-6 pt-2">
          <div className="flex items-center gap-3">
            <Toggle checked={v.is_active ?? false} onChange={val => updateVoice('is_active', val)} />
            <span className="text-sm text-white">Voice Agent Active</span>
          </div>
          <div className="flex items-center gap-3">
            <Toggle checked={v.realtime_enabled ?? false} onChange={val => updateVoice('realtime_enabled', val)} />
            <span className="text-sm text-white">Realtime (WebRTC)</span>
          </div>
        </div>

        <div>
          <label className={label}>Voice</label>
          <div className="grid grid-cols-4 md:grid-cols-6 gap-2">
            {VOICES.map(voice => (
              <button key={voice} onClick={() => updateVoice('voice', voice)}
                className={`py-2 rounded-lg border text-xs font-medium capitalize ${
                  (v.voice || 'alloy') === voice ? 'border-primary-500 bg-primary-500/10 text-white' : 'border-dark-border text-t-secondary'
                }`}>
                <Volume2 size={11} className="inline mr-1" />{voice}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={label}>Realtime Model</label>
            <select value={v.realtime_model || 'gpt-4o-realtime-preview'} onChange={e => updateVoice('realtime_model', e.target.value)} className={input}>
              <option value="gpt-4o-realtime-preview">gpt-4o-realtime-preview (latest)</option>
              <option value="gpt-4o-realtime-preview-2025-06-03">gpt-4o-realtime-preview-2025-06-03</option>
              <option value="gpt-4o-realtime-preview-2024-12-17">gpt-4o-realtime-preview-2024-12-17</option>
              <option value="gpt-4o-mini-realtime-preview">gpt-4o-mini-realtime-preview (cheap)</option>
              <option value="gpt-4.1-realtime-preview">gpt-4.1-realtime-preview (newest)</option>
            </select>
          </div>
          <div>
            <label className={label}>Language</label>
            <select value={v.language || 'auto'} onChange={e => updateVoice('language', e.target.value)} className={input}>
              {[
                ['auto', 'Auto-detect'], ['en', 'English'], ['es', 'Spanish'], ['fr', 'French'], ['de', 'German'],
                ['it', 'Italian'], ['pt', 'Portuguese'], ['ru', 'Russian'], ['ar', 'Arabic'], ['zh', 'Chinese'],
                ['ja', 'Japanese'], ['ko', 'Korean'], ['nl', 'Dutch'], ['pl', 'Polish'], ['tr', 'Turkish'], ['uk', 'Ukrainian'],
              ].map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={label}>Temperature: {v.temperature ?? 0.8}</label>
          <input type="range" min={0} max={1.5} step={0.1} value={v.temperature ?? 0.8}
            onChange={e => updateVoice('temperature', parseFloat(e.target.value))}
            className="w-full h-1.5 bg-dark-bg rounded-lg appearance-none cursor-pointer accent-primary-500" />
        </div>

        <div>
          <label className={label}>Voice Instructions (optional — overrides text personality for voice calls)</label>
          <textarea value={v.voice_instructions || ''} onChange={e => updateVoice('voice_instructions', e.target.value)} rows={4}
            className={input + ' font-mono'} placeholder="Leave empty to auto-generate from chatbot behavior config." />
        </div>

        <div className="flex justify-end pt-3 border-t border-dark-border">
          <button onClick={() => voiceSave.mutate(v)} disabled={!voiceDirty || voiceSave.isPending}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-500 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
            <Save size={14} /> {voiceSave.isPending ? 'Saving...' : 'Save Voice Config'}
          </button>
        </div>
      </div>
    </div>
  )

  const renderInstall = () => (
    <div className="space-y-4">
      <div className={card}>
        <h3 className={cardTitle}><Code size={14} className="text-primary-500" /> Integration Code</h3>
        <p className="text-[11px] text-t-secondary -mt-1">Choose an installation method. Each organization gets a unique widget key.</p>

        <div className="flex gap-1 bg-dark-bg rounded-lg p-1">
          {(['script', 'iframe', 'api'] as const).map(t => (
            <button key={t} onClick={() => setEmbedTab(t)}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-medium capitalize ${
                embedTab === t ? 'bg-primary-500/15 text-primary-500 border border-primary-500/30' : 'text-t-secondary hover:text-white'
              }`}>{t === 'script' ? 'Script Tag' : t === 'iframe' ? 'Iframe' : 'API'}</button>
          ))}
        </div>

        {embedTab === 'script' && (
          <div className="space-y-2">
            <p className="text-[11px] text-t-secondary">Paste this before the closing <code className="text-primary-500">&lt;/body&gt;</code> tag.</p>
            <div className="bg-dark-bg border border-dark-border rounded-lg p-3 relative group">
              <pre className="text-xs text-green-400 whitespace-pre-wrap break-all font-mono">{embed?.embed_code || (config?.id ? 'Loading...' : 'Save widget config first')}</pre>
              <button onClick={() => copyCode(embed?.embed_code, 'script')} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-dark-card text-t-secondary hover:text-white p-1.5 rounded">
                {copied === 'script' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {embedTab === 'iframe' && (
          <div className="space-y-2">
            <p className="text-[11px] text-t-secondary">Drop-in iframe — works with WordPress, Wix, Squarespace.</p>
            <div className="bg-dark-bg border border-dark-border rounded-lg p-3 relative group">
              <pre className="text-xs text-blue-400 whitespace-pre-wrap break-all font-mono">{embed?.iframe_code || (config?.id ? 'Loading...' : 'Save widget config first')}</pre>
              <button onClick={() => copyCode(embed?.iframe_code, 'iframe')} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-dark-card text-t-secondary hover:text-white p-1.5 rounded">
                {copied === 'iframe' ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        )}

        {embedTab === 'api' && (
          <div className="space-y-2">
            <p className="text-[11px] text-t-secondary">REST API endpoints for custom integrations.</p>
            {embed?.api_info?.endpoints && Object.entries(embed.api_info.endpoints).map(([name, ep]: [string, any]) => (
              <div key={name} className="flex items-center gap-2 bg-dark-bg border border-dark-border rounded-lg px-3 py-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ep.method === 'GET' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{ep.method}</span>
                <code className="text-[11px] text-t-secondary font-mono flex-1 truncate">{ep.url}</code>
                <button onClick={() => copyCode(ep.url, name)} className="text-t-secondary hover:text-white"><Copy size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {config?.id && (
          <div className="flex items-center gap-4 pt-3 mt-2 border-t border-dark-border text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-t-secondary">Widget Key:</span>
              <code className="text-primary-500 font-mono">{config.widget_key?.slice(0, 12)}...</code>
              <button onClick={() => copyCode(config.widget_key, 'key')} className="text-t-secondary hover:text-white"><Copy size={11} /></button>
            </div>
            <div className="flex-1" />
            <button onClick={() => regenKey.mutate()} disabled={regenKey.isPending}
              className="flex items-center gap-1 text-primary-500 hover:text-primary-400 text-xs">
              <RefreshCw size={12} className={regenKey.isPending ? 'animate-spin' : ''} /> Regenerate API Key
            </button>
          </div>
        )}
      </div>
    </div>
  )

  // ─── Layout ──────────────────────────────────────────────────────────────
  const showPreview = tab !== 'install'

  return (
    <div className="space-y-5">
      {/* Sub-tab nav */}
      <div className="flex gap-1 border-b border-dark-border overflow-x-auto">
        {SUB_TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => switchTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                active ? 'border-primary-500 text-white' : 'border-transparent text-t-secondary hover:text-white'
              }`}>
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      <div className={showPreview ? 'grid grid-cols-1 xl:grid-cols-12 gap-5' : ''}>
        {/* Form column */}
        <div className={showPreview ? 'xl:col-span-7 space-y-5 min-w-0' : 'space-y-5'}>
          {tab === 'appearance' && renderAppearance()}
          {tab === 'copy'       && renderCopy()}
          {tab === 'behavior'   && renderBehavior()}
          {tab === 'voice'      && renderVoice()}
          {tab === 'install'    && renderInstall()}

          {/* Sticky save bar — only for widget config tabs (voice has its own save) */}
          {tab !== 'voice' && tab !== 'install' && (
            <div className="sticky bottom-0 -mx-2 px-2 py-3 bg-dark-bg/95 backdrop-blur border-t border-dark-border flex items-center justify-between">
              <span className="text-xs text-t-secondary">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
              <button onClick={() => saveMutation.mutate(f)} disabled={!dirty || saveMutation.isPending}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-primary-500 text-black rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                <Save size={14} /> {saveMutation.isPending ? 'Saving...' : 'Save Widget Config'}
              </button>
            </div>
          )}
        </div>

        {/* Live preview column */}
        {showPreview && (
          <div className="xl:col-span-5">
            <div className="xl:sticky xl:top-4">
              <WidgetPreview cfg={f} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── Live Widget Preview ─────────────────────────────────────────────────── */

function WidgetPreview({ cfg }: { cfg: any }) {
  const [open, setOpen] = useState(true)

  const primary       = cfg.primary_color || '#c9a84c'
  const headerStyle   = cfg.header_style || 'solid'
  const headerBg      = headerStyle === 'gradient'
    ? `linear-gradient(135deg, ${primary} 0%, ${cfg.header_gradient_end || primary} 100%)`
    : primary
  const headerText    = cfg.header_text_color || '#ffffff'
  const userBubble    = cfg.user_bubble_color || primary
  const userBubbleTxt = cfg.user_bubble_text || '#ffffff'
  const botBubble     = cfg.bot_bubble_color || '#f3f4f6'
  const botBubbleTxt  = cfg.bot_bubble_text || '#1f2937'
  const chatBg        = cfg.chat_bg_color || '#ffffff'
  const radius        = cfg.border_radius ?? 16
  const font          = cfg.font_family || 'Inter'
  const position      = cfg.position || 'bottom-right'
  const isLeft        = position === 'bottom-left'

  const launcherSize   = cfg.launcher_size || 56
  const launcherShape  = cfg.launcher_shape || 'circle'
  const launcherWidth  = launcherShape === 'pill' ? Math.round(launcherSize * 1.7) : launcherSize
  const launcherHeight = launcherSize
  const launcherRadius = launcherShape === 'circle' ? '50%'
    : launcherShape === 'pill' ? '999px'
    : launcherShape === 'rounded-square' ? '16px'
    : '6px'
  const LauncherIcon = LAUNCHER_ICON_MAP[cfg.launcher_icon || 'chat'] || MessageSquare

  const status = cfg.agent_status || 'online'
  const statusColor = status === 'online' ? '#10b981' : status === 'away' ? '#f59e0b' : '#6b7280'

  const headerTitle    = cfg.header_title || cfg.company_name || 'AI Assistant'
  const headerSubtitle = cfg.header_subtitle || 'Ask me anything'
  const welcomeTitle   = cfg.welcome_title || 'Hi! How can I help you today?'
  const welcomeSub     = cfg.welcome_subtitle || 'Ask about reservations, loyalty program, hotel services, or anything else.'
  const placeholder    = cfg.input_placeholder || 'Type a message...'
  const showBranding   = cfg.show_branding ?? true
  const brandingText   = cfg.branding_text || 'Powered by Hotel AI'
  const showSugg       = cfg.show_suggestions ?? true
  const suggestions: string[] = (Array.isArray(cfg.suggestions) ? cfg.suggestions : []).filter(Boolean)
  const avatarUrl      = cfg.assistant_avatar_url ? (resolveImage(cfg.assistant_avatar_url) || cfg.assistant_avatar_url) : ''

  return (
    <div className={card}>
      <div className="flex items-center justify-between">
        <h3 className={cardTitle}><MessageSquare size={14} className="text-primary-500" /> Live Preview</h3>
        <button onClick={() => setOpen(o => !o)} className={btnSec}>
          {open ? 'Show launcher' : 'Open chat'}
        </button>
      </div>
      <p className="text-[11px] text-t-secondary -mt-2">Reflects unsaved changes. Not a live chat — for layout only.</p>

      {/* Browser-window mock */}
      <div
        className="relative rounded-xl overflow-hidden border border-dark-border shadow-inner"
        style={{
          background: 'repeating-linear-gradient(45deg, #18181b, #18181b 10px, #1f1f23 10px, #1f1f23 20px)',
          height: 520,
          fontFamily: `'${font}', system-ui, sans-serif`,
        }}
      >
        {/* Fake browser chrome */}
        <div className="flex items-center gap-1.5 px-3 py-2 bg-[#0f0f10] border-b border-dark-border">
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
          <span className="ml-3 text-[10px] text-[#636366] truncate">your-hotel.com</span>
        </div>

        {/* Launcher (when closed) */}
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="absolute flex items-center justify-center shadow-lg transition-transform hover:scale-105"
            style={{
              [isLeft ? 'left' : 'right']: 18,
              bottom: 18,
              width: launcherWidth,
              height: launcherHeight,
              borderRadius: launcherRadius,
              background: headerBg,
              color: headerText,
              border: 'none',
              cursor: 'pointer',
            } as any}
            aria-label="Open chat"
          >
            <LauncherIcon size={Math.round(launcherSize * 0.42)} />
          </button>
        )}

        {/* Chat panel (when open) */}
        {open && (
          <div
            className="absolute flex flex-col overflow-hidden shadow-2xl"
            style={{
              [isLeft ? 'left' : 'right']: 18,
              bottom: 18,
              width: 320,
              maxWidth: 'calc(100% - 36px)',
              height: 440,
              background: chatBg,
              borderRadius: radius,
              color: botBubbleTxt,
            } as any}
          >
            {/* Header */}
            <div className="flex items-center gap-2.5 px-3.5 py-3 shrink-0" style={{ background: headerBg, color: headerText }}>
              <div className="relative shrink-0">
                <div
                  className="rounded-full overflow-hidden flex items-center justify-center"
                  style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.2)' }}
                >
                  {avatarUrl
                    ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                    : <MessageSquare size={18} />}
                </div>
                <span
                  className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2"
                  style={{ background: statusColor, borderColor: headerBg.includes('gradient') ? primary : headerBg }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold truncate" style={{ color: headerText }}>{headerTitle}</div>
                <div className="text-[11px] truncate" style={{ color: headerText, opacity: 0.85 }}>{headerSubtitle}</div>
              </div>
              <button className="shrink-0 rounded-full flex items-center justify-center"
                style={{ width: 32, height: 32, background: '#22c55e', color: '#fff' }}
                title="Voice call">
                <Phone size={14} />
              </button>
              <button className="shrink-0 opacity-80 hover:opacity-100" style={{ color: headerText }} onClick={() => setOpen(false)} title="Close">
                <X size={16} />
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5" style={{ background: chatBg }}>
              {/* Welcome bot bubble */}
              <div className="flex">
                <div
                  className="px-3 py-2 text-[12px] leading-snug max-w-[85%]"
                  style={{ background: botBubble, color: botBubbleTxt, borderRadius: Math.max(radius - 4, 6), borderBottomLeftRadius: 4 }}
                >
                  <div className="font-semibold mb-0.5">{welcomeTitle}</div>
                  <div className="opacity-80">{welcomeSub}</div>
                </div>
              </div>

              {/* Suggestion chips */}
              {showSugg && suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {suggestions.slice(0, 6).map((s, i) => (
                    <button key={i}
                      className="text-[11px] px-2.5 py-1 border"
                      style={{
                        borderRadius: Math.max(radius - 6, 4),
                        borderColor: primary,
                        color: primary,
                        background: 'transparent',
                      }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}

              {/* Sample user bubble */}
              <div className="flex justify-end pt-1">
                <div
                  className="px-3 py-2 text-[12px] max-w-[80%]"
                  style={{ background: userBubble, color: userBubbleTxt, borderRadius: Math.max(radius - 4, 6), borderBottomRightRadius: 4 }}
                >
                  Do you have rooms available this weekend?
                </div>
              </div>

              {/* Sample bot reply */}
              <div className="flex">
                <div
                  className="px-3 py-2 text-[12px] max-w-[85%]"
                  style={{ background: botBubble, color: botBubbleTxt, borderRadius: Math.max(radius - 4, 6), borderBottomLeftRadius: 4 }}
                >
                  Yes — we have several rooms available. Would you like me to check availability for specific dates?
                </div>
              </div>
            </div>

            {/* Input */}
            <div className="border-t shrink-0 px-3 py-2.5" style={{ borderColor: 'rgba(0,0,0,0.08)', background: chatBg }}>
              <div className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                style={{ background: 'rgba(0,0,0,0.04)', borderRadius: Math.max(radius - 6, 6) }}>
                <input
                  className="flex-1 bg-transparent outline-none text-[12px]"
                  style={{ color: botBubbleTxt }}
                  placeholder={placeholder}
                  readOnly
                />
                <button
                  className="shrink-0 rounded-full flex items-center justify-center"
                  style={{ width: 26, height: 26, background: primary, color: userBubbleTxt }}
                >
                  <Send size={12} />
                </button>
              </div>
              {showBranding && (
                <div className="text-center mt-1.5 text-[10px]" style={{ color: '#9ca3af' }}>
                  {brandingText}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
