import { useState } from 'react'
import {
  Globe, Shield, ExternalLink, Copy, Palette, Sun, Moon,
  Clock, DollarSign, Zap, CreditCard, Scissors, Building2, Check,
  Type, Square, Code,
} from 'lucide-react'

/**
 * Booking tab — unified layout with 3 sections: Embed (tabbed), Appearance,
 * and Booking Rules (grouped per surface: rooms vs services). Policies and
 * per-surface settings live together in one card instead of being spread
 * across five separate cards.
 */

type BookingPolicies = {
  check_in_time: string; check_out_time: string;
  cancellation_policy: string; payment_terms: string;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CHF', 'AED', 'SAR', 'THB', 'JPY', 'AUD', 'CAD', 'SGD', 'INR', 'BRL', 'ZAR', 'ILS']

interface Props {
  getVal: (key: string) => string
  handleChange: (key: string, value: string) => void
  widgetToken: string
  cardClass: string
  cardStyle: React.CSSProperties
  inputClass: string
  btnPrimary: string
}

type CopyState = Record<string, boolean>

export function BookingTab({ getVal, handleChange, widgetToken, cardClass, cardStyle, inputClass }: Props) {
  const widgetBaseUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost/hotel-tech/apps/loyalty/backend/public'

  const rooms = {
    snippet: `<!-- Hotel Tech Booking Widget -->\n<div id="hoteltech-booking"></div>\n<script src="${widgetBaseUrl}/widget/booking-loader.js"\n        data-org="${widgetToken}"></script>`,
    preview: `${widgetBaseUrl}/booking-widget?org=${widgetToken}`,
    direct:  `${widgetBaseUrl}/book/${widgetToken}`,
  }
  const services = {
    snippet: `<!-- Hotel Tech Services Widget -->\n<div id="hoteltech-services"></div>\n<script src="${widgetBaseUrl}/widget/services-loader.js"\n        data-org="${widgetToken}"></script>`,
    preview: `${widgetBaseUrl}/services-widget?org=${widgetToken}`,
    direct:  `${widgetBaseUrl}/services/${widgetToken}`,
  }

  const [activeEmbed, setActiveEmbed] = useState<'rooms' | 'services'>('rooms')
  const [copied, setCopied] = useState<CopyState>({})
  const flashCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(prev => ({ ...prev, [key]: true }))
    setTimeout(() => setCopied(prev => ({ ...prev, [key]: false })), 2000)
  }
  const copyBtn = (key: string, text: string, compact = false) => (
    <button onClick={() => flashCopy(key, text)}
      className={`${compact ? 'px-2.5 py-1.5' : 'px-3 py-1.5'} rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1`}
      style={{
        background: copied[key] ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)',
        color: copied[key] ? '#22c55e' : '#8e8e93',
        border: copied[key] ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)',
      }}>
      {copied[key] ? <Check size={10} /> : <Copy size={10} />} {copied[key] ? 'Copied' : 'Copy'}
    </button>
  )

  const parseJsonSetting = <T,>(key: string, fallback: T): T => {
    const raw = getVal(key)
    if (!raw) return fallback
    try { return JSON.parse(raw) } catch { return fallback }
  }

  const bookingPolicies: BookingPolicies = parseJsonSetting('booking_policies', {
    check_in_time: '15:00', check_out_time: '11:00', cancellation_policy: '', payment_terms: '',
  })
  const updatePolicies = (p: BookingPolicies) => handleChange('booking_policies', JSON.stringify(p))

  // Per-widget appearance is keyed by surface — `booking_widget_*` for the
  // room booking widget, `services_widget_*` for the services widget.
  // Both back-ends already read these separately; the UI just lets you
  // edit each set without overwriting the other.
  const [appearanceTab, setAppearanceTab] = useState<'rooms' | 'services'>('rooms')
  const stylePrefix = appearanceTab === 'rooms' ? 'booking_widget' : 'services_widget'
  const sk = (suffix: string) => `${stylePrefix}_${suffix}`

  const widgetTheme       = getVal(sk('theme'))       || 'light'
  const widgetColor       = getVal(sk('color'))       || '#2d6a4f'
  const widgetRadius      = getVal(sk('radius'))      || '12'
  const widgetFont        = getVal(sk('font'))        || 'system'
  const widgetButtonStyle = getVal(sk('button_style')) || 'filled'
  const widgetBgColor     = getVal(sk('bg_color'))    || ''
  const widgetTextColor   = getVal(sk('text_color'))  || ''
  const widgetCustomCss   = getVal(sk('custom_css'))  || ''

  // Map our font picker to the actual CSS font-family value the widget
  // applies (--font CSS variable). 'system' keeps the widget on its
  // packaged Inter / Cormorant pairing.
  const FONT_OPTIONS: { id: string; label: string; value: string }[] = [
    { id: 'system',    label: 'System (Inter)',  value: '' },
    { id: 'serif',     label: 'Serif (Georgia)', value: 'Georgia, "Times New Roman", serif' },
    { id: 'mono',      label: 'Mono (JetBrains)', value: '"JetBrains Mono", "SF Mono", Consolas, monospace' },
    { id: 'rounded',   label: 'Rounded (Nunito)', value: 'Nunito, "Helvetica Neue", sans-serif' },
    { id: 'editorial', label: 'Editorial (Cormorant)', value: '"Cormorant Garamond", Georgia, serif' },
  ]
  const activeFontId = FONT_OPTIONS.find(f => f.value === widgetFont)?.id ?? (widgetFont ? 'custom' : 'system')

  const isOn = (key: string, fallback = 'false') => (getVal(key) || fallback) === 'true'
  const toggle = (key: string, fallback = 'false') => handleChange(key, isOn(key, fallback) ? 'false' : 'true')

  const Toggle = ({ on, onClick, color = 'emerald' }: { on: boolean; onClick: () => void; color?: 'emerald' | 'amber' }) => (
    <button onClick={onClick}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${on ? (color === 'amber' ? 'bg-amber-500' : 'bg-emerald-500') : 'bg-white/[0.1]'}`}>
      <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
    </button>
  )

  const embed = activeEmbed === 'rooms' ? rooms : services
  const embedLabel = activeEmbed === 'rooms' ? 'Room Booking' : 'Services Booking'

  return (
    <div className="space-y-6">

      {/* ── 1. Widget Embed (tabbed rooms / services) ── */}
      <div className={cardClass} style={cardStyle}>
        <div className="flex items-start justify-between mb-4 gap-4">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Globe size={15} className="text-blue-400" /> Widget Embed
            </h3>
            <p className="text-xs text-gray-500 mt-1">Paste these snippets into your website. Both widgets share the same token and appearance.</p>
          </div>
          {widgetToken && (
            <span className="text-[10px] text-gray-500 font-mono bg-white/[0.04] border border-white/[0.06] px-2 py-1 rounded-md whitespace-nowrap">
              <Shield size={10} className="inline -mt-px mr-1" /> {widgetToken.slice(0, 12)}…
            </span>
          )}
        </div>

        {!widgetToken ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
            <p className="text-xs text-amber-400">Complete the setup wizard to generate a widget token.</p>
          </div>
        ) : (
          <>
            {/* Tabs */}
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-1 mb-4 w-fit" style={{ background: 'rgba(15,28,24,0.6)' }}>
              {[
                { id: 'rooms' as const,    label: 'Rooms',    icon: <Building2 size={12} /> },
                { id: 'services' as const, label: 'Services', icon: <Scissors size={12} /> },
              ].map(tab => (
                <button key={tab.id} onClick={() => setActiveEmbed(tab.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeEmbed === tab.id ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  {tab.icon} {tab.label}
                </button>
              ))}
            </div>

            {/* Snippet */}
            <div className="relative">
              <pre className="text-xs font-mono bg-black/40 border border-white/[0.06] rounded-xl p-4 overflow-x-auto text-gray-300 whitespace-pre-wrap">{embed.snippet}</pre>
              <div className="absolute top-3 right-3">{copyBtn(`${activeEmbed}-snippet`, embed.snippet)}</div>
            </div>

            {/* Direct URL + preview link */}
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 text-xs font-mono bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-gray-300 overflow-x-auto">{embed.direct}</code>
              {copyBtn(`${activeEmbed}-direct`, embed.direct, true)}
              <a href={embed.preview} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider text-blue-400 hover:bg-blue-500/10 border border-blue-500/20 transition-colors">
                <ExternalLink size={10} /> Preview
              </a>
            </div>
            <p className="text-[10px] text-gray-600 mt-1.5">Standalone {embedLabel.toLowerCase()} page — share directly with guests.</p>

            <details className="mt-3 text-[11px] text-gray-500">
              <summary className="cursor-pointer hover:text-gray-400 select-none">Optional script attributes</summary>
              <div className="mt-2 p-3 rounded-lg bg-white/[0.02] border border-white/[0.04] leading-relaxed">
                <code className="text-gray-400">data-lang="en"</code> · language ·{' '}
                <code className="text-gray-400">data-primary-color="#c9a84c"</code> · brand color ·{' '}
                <code className="text-gray-400">data-container="my-id"</code> · custom container ID
              </div>
            </details>
          </>
        )}
      </div>

      {/* ── 2. Appearance — per-widget (Rooms / Services) ── */}
      <div className={cardClass} style={cardStyle}>
        <div className="flex items-start justify-between gap-3 mb-1">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Palette size={15} className="text-emerald-400" /> Appearance
          </h3>
          {/* Per-widget tab. Each widget keeps its own settings — pick one,
              edit it, the other stays untouched. */}
          <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-1" style={{ background: 'rgba(15,28,24,0.6)' }}>
            {[
              { id: 'rooms' as const,    label: 'Rooms',    icon: <Building2 size={12} /> },
              { id: 'services' as const, label: 'Services', icon: <Scissors size={12} /> },
            ].map(tab => (
              <button key={tab.id} onClick={() => setAppearanceTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${appearanceTab === tab.id ? 'bg-white/[0.08] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Visual style for the {appearanceTab === 'rooms' ? 'room booking' : 'services'} widget. Settings are stored per-widget — the other one keeps its own values.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
          <div className="space-y-3">
            {/* Theme */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <label className="block text-sm font-medium text-white">Theme</label>
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-1" style={{ background: 'rgba(15,28,24,0.6)' }}>
                <button onClick={() => handleChange(sk('theme'), 'light')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetTheme === 'light' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  <Sun size={12} /> Light
                </button>
                <button onClick={() => handleChange(sk('theme'), 'dark')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetTheme === 'dark' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                  <Moon size={12} /> Dark
                </button>
              </div>
            </div>

            {/* Primary Color */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <label className="block text-sm font-medium text-white">Primary Color</label>
              <div className="flex items-center gap-2 w-48">
                <input type="color" value={widgetColor}
                  onChange={e => handleChange(sk('color'), e.target.value)}
                  className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
                <input type="text" value={widgetColor}
                  onChange={e => handleChange(sk('color'), e.target.value)}
                  placeholder="#2d6a4f" maxLength={7}
                  className={inputClass + ' flex-1 font-mono'} />
              </div>
            </div>

            {/* Background colour override (optional — empty = theme default) */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <label className="block text-sm font-medium text-white">
                Background <span className="text-[10px] text-gray-500 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2 w-48">
                <input type="color" value={widgetBgColor || '#ffffff'}
                  onChange={e => handleChange(sk('bg_color'), e.target.value)}
                  className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
                <input type="text" value={widgetBgColor}
                  onChange={e => handleChange(sk('bg_color'), e.target.value)}
                  placeholder="auto"
                  className={inputClass + ' flex-1 font-mono'} />
              </div>
            </div>

            {/* Text colour override */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <label className="block text-sm font-medium text-white">
                Text Color <span className="text-[10px] text-gray-500 font-normal">(optional)</span>
              </label>
              <div className="flex items-center gap-2 w-48">
                <input type="color" value={widgetTextColor || '#1a1a1a'}
                  onChange={e => handleChange(sk('text_color'), e.target.value)}
                  className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
                <input type="text" value={widgetTextColor}
                  onChange={e => handleChange(sk('text_color'), e.target.value)}
                  placeholder="auto"
                  className={inputClass + ' flex-1 font-mono'} />
              </div>
            </div>

            {/* Border Radius */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <label className="block text-sm font-medium text-white">Border Radius</label>
              <div className="flex items-center gap-3 w-48">
                <input type="range" min={0} max={24} value={Number(widgetRadius)}
                  onChange={e => handleChange(sk('radius'), e.target.value)}
                  className="flex-1 accent-emerald-500" />
                <span className="text-xs text-gray-400 font-mono w-8 text-right">{widgetRadius}px</span>
              </div>
            </div>

            {/* Button style */}
            <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
              <label className="block text-sm font-medium text-white flex items-center gap-1.5">
                <Square size={13} className="text-gray-500" /> Button Style
              </label>
              <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-1" style={{ background: 'rgba(15,28,24,0.6)' }}>
                {[
                  { id: 'filled',  label: 'Filled' },
                  { id: 'outline', label: 'Outline' },
                  { id: 'soft',    label: 'Soft' },
                ].map(opt => (
                  <button key={opt.id} onClick={() => handleChange(sk('button_style'), opt.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetButtonStyle === opt.id ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Font family */}
            <div className="flex items-center justify-between py-2">
              <label className="block text-sm font-medium text-white flex items-center gap-1.5">
                <Type size={13} className="text-gray-500" /> Typography
              </label>
              <select value={activeFontId === 'custom' ? 'system' : activeFontId}
                onChange={e => {
                  const opt = FONT_OPTIONS.find(f => f.id === e.target.value)
                  handleChange(sk('font'), opt?.value ?? '')
                }}
                className={inputClass + ' w-48 appearance-none cursor-pointer'} style={{ colorScheme: 'dark' }}>
                {FONT_OPTIONS.map(opt => (
                  <option key={opt.id} value={opt.id} style={{ background: '#0f1c18', color: '#fff' }}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Live preview */}
          <div className="rounded-xl overflow-hidden border border-white/[0.08]"
            style={{
              borderRadius: `${widgetRadius}px`,
              background: widgetBgColor || (widgetTheme === 'dark' ? '#1a1a2e' : '#ffffff'),
              color: widgetTextColor || (widgetTheme === 'dark' ? '#fff' : '#1a1a1a'),
              width: 280, justifySelf: 'end',
              fontFamily: widgetFont || undefined,
            }}>
            <div className="px-4 py-2" style={{ borderBottom: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
              <span style={{ color: widgetTheme === 'dark' ? '#aaa' : '#666', fontSize: 11, fontWeight: 500 }}>
                Live preview · {appearanceTab === 'rooms' ? 'Rooms' : 'Services'}
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                {(appearanceTab === 'rooms' ? ['Check-in', 'Check-out'] : ['Date', 'Time']).map((lbl, i) => (
                  <div key={lbl} className="flex-1 rounded-lg p-2" style={{
                    background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                    border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                    borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                  }}>
                    <p style={{ fontSize: 9, color: widgetTheme === 'dark' ? '#aaa' : '#666', marginBottom: 2 }}>{lbl}</p>
                    <p style={{ fontSize: 11, fontWeight: 600 }}>
                      {appearanceTab === 'rooms'
                        ? (i === 0 ? 'Apr 15' : 'Apr 18')
                        : (i === 0 ? 'Apr 15' : '14:30')}
                    </p>
                  </div>
                ))}
              </div>
              <button style={{
                width: '100%', padding: '8px 0', borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                fontSize: 11, fontWeight: 700, cursor: 'default',
                ...(widgetButtonStyle === 'outline'
                  ? { background: 'transparent', color: widgetColor, border: `1.5px solid ${widgetColor}` }
                  : widgetButtonStyle === 'soft'
                    ? { background: widgetColor + '22', color: widgetColor, border: 'none' }
                    : { background: widgetColor, color: '#fff', border: 'none' }),
              }}>{appearanceTab === 'rooms' ? 'Book Now' : 'Book Service'}</button>
            </div>
          </div>
        </div>

        {/* Custom CSS escape hatch */}
        <div className="mt-6 pt-5 border-t border-white/[0.04]">
          <details className="group">
            <summary className="cursor-pointer flex items-center gap-2 text-sm font-medium text-white hover:text-gray-200">
              <Code size={14} className="text-amber-400" />
              Custom CSS
              <span className="text-[10px] font-normal text-gray-500 ml-1">advanced — overrides everything</span>
              <span className="ml-auto text-[10px] text-gray-600 group-open:hidden">Click to edit</span>
            </summary>
            <p className="text-xs text-gray-500 mt-2 mb-3">
              Injected as a {'<style>'} tag at the bottom of the {appearanceTab === 'rooms' ? 'rooms' : 'services'} widget. Use this for hotel-specific tweaks the standard options can't reach (custom fonts via @import, brand-specific spacing, hover effects, etc.). Empty = none.
            </p>
            <textarea value={widgetCustomCss}
              onChange={e => handleChange(sk('custom_css'), e.target.value)}
              placeholder={`/* Example: change room card hover\n.room-card:hover { transform: translateY(-2px); }\n\n/* Example: load a custom font */\n@import url('https://fonts.googleapis.com/css2?family=Playfair+Display&display=swap');\nbody { font-family: 'Playfair Display', serif; }`}
              rows={8} spellCheck={false}
              className={inputClass + ' font-mono text-xs leading-relaxed'} />
            <p className="text-[10px] text-gray-600 mt-2">
              Tip: target <code className="text-gray-400">.btn-primary</code>, <code className="text-gray-400">.room-card</code>, <code className="text-gray-400">.field input</code>, or any element via inspector. CSS variables: <code className="text-gray-400">--primary</code>, <code className="text-gray-400">--bg</code>, <code className="text-gray-400">--text</code>, <code className="text-gray-400">--radius</code>, <code className="text-gray-400">--font</code>.
            </p>
          </details>
        </div>
      </div>

      {/* ── 3. Booking Rules (rooms + services sub-groups) ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Shield size={15} className="text-emerald-400" /> Booking Rules & Policies
        </h3>
        <p className="text-xs text-gray-500 mb-5">Stay limits, cancellation terms and payment behavior for both widgets.</p>

        {/* Rooms sub-group */}
        <div className="rounded-xl border border-white/[0.06] p-4 mb-4" style={{ background: 'rgba(15,28,24,0.4)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
            <Building2 size={12} className="text-blue-400" /> Room Bookings
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1"><Clock size={10} /> Check-in</label>
              <input type="text" value={bookingPolicies.check_in_time} placeholder="15:00"
                onChange={e => updatePolicies({ ...bookingPolicies, check_in_time: e.target.value })}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1"><Clock size={10} /> Check-out</label>
              <input type="text" value={bookingPolicies.check_out_time} placeholder="11:00"
                onChange={e => updatePolicies({ ...bookingPolicies, check_out_time: e.target.value })}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1"><DollarSign size={10} /> Currency</label>
              <select value={getVal('booking_currency') || 'EUR'}
                onChange={e => handleChange('booking_currency', e.target.value)}
                className={inputClass + ' appearance-none cursor-pointer'} style={{ colorScheme: 'dark' }}>
                {CURRENCIES.map(c => <option key={c} value={c} style={{ background: '#0f1c18', color: '#fff' }}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Nights (min–max)</label>
              <div className="flex gap-2">
                <input type="number" value={getVal('booking_min_nights') || '1'} min={1} max={30}
                  onChange={e => handleChange('booking_min_nights', e.target.value)} className={inputClass} />
                <input type="number" value={getVal('booking_max_nights') || '30'} min={1} max={365}
                  onChange={e => handleChange('booking_max_nights', e.target.value)} className={inputClass} />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Cancellation Policy</label>
              <textarea value={bookingPolicies.cancellation_policy}
                onChange={e => updatePolicies({ ...bookingPolicies, cancellation_policy: e.target.value })}
                placeholder="e.g. Free cancellation up to 48 hours before check-in…"
                rows={2} className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Payment Terms</label>
              <textarea value={bookingPolicies.payment_terms}
                onChange={e => updatePolicies({ ...bookingPolicies, payment_terms: e.target.value })}
                placeholder="e.g. Full payment required at time of booking…"
                rows={2} className={inputClass} />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2 border-t border-white/[0.04]">
            <div className="flex items-center gap-3">
              <Toggle on={isOn('booking_payment_enabled')} onClick={() => toggle('booking_payment_enabled')} />
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5"><CreditCard size={13} className="text-gray-500" /> Online Payment</p>
                <p className="text-[11px] text-gray-500">Stripe checkout at reservation</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Toggle on={isOn('booking_mock_mode')} onClick={() => toggle('booking_mock_mode')} color="amber" />
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5"><Zap size={13} className="text-gray-500" /> Mock Mode</p>
                <p className="text-[11px] text-gray-500">Simulated bookings, no charges or emails</p>
              </div>
            </div>
          </div>

          {isOn('booking_payment_enabled') && !getVal('stripe_secret_key') && (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2">
              <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                <Zap size={11} /> Stripe secret key missing — configure it in Integrations before going live.
              </p>
            </div>
          )}
        </div>

        {/* Services sub-group */}
        <div className="rounded-xl border border-white/[0.06] p-4" style={{ background: 'rgba(15,28,24,0.4)' }}>
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-1.5">
            <Scissors size={12} className="text-emerald-400" /> Service Bookings
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1"><Clock size={10} /> Slot Step</label>
              <select value={getVal('services_slot_step') || '30'}
                onChange={e => handleChange('services_slot_step', e.target.value)}
                className={inputClass + ' appearance-none cursor-pointer'} style={{ colorScheme: 'dark' }}>
                {[10, 15, 20, 30, 45, 60].map(v =>
                  <option key={v} value={v} style={{ background: '#0f1c18', color: '#fff' }}>{v} min</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Lead Time (min)</label>
              <input type="number" value={getVal('services_lead_minutes') || '60'} min={0} max={10080}
                onChange={e => handleChange('services_lead_minutes', e.target.value)}
                className={inputClass} />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Max Advance (days)</label>
              <input type="number" value={getVal('services_max_advance_days') || '60'} min={1} max={365}
                onChange={e => handleChange('services_max_advance_days', e.target.value)}
                className={inputClass} />
            </div>
            {isOn('services_require_deposit') && (
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Deposit (%)</label>
                <input type="number" value={getVal('services_deposit_percent') || '100'} min={5} max={100}
                  onChange={e => handleChange('services_deposit_percent', e.target.value)}
                  className={inputClass} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Cancellation Policy</label>
            <textarea value={getVal('services_cancellation_policy') || ''}
              onChange={e => handleChange('services_cancellation_policy', e.target.value)}
              placeholder="e.g. Free cancellation up to 4 hours before appointment. Late cancellations forfeit the deposit."
              rows={2} className={inputClass} />
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-3 mt-3 border-t border-white/[0.04]">
            <div className="flex items-center gap-3">
              <Toggle on={isOn('services_allow_master_choice', 'true')} onClick={() => toggle('services_allow_master_choice', 'true')} />
              <div>
                <p className="text-sm font-medium text-white">Guest Picks Master</p>
                <p className="text-[11px] text-gray-500">Off = system auto-assigns</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Toggle on={isOn('services_require_deposit')} onClick={() => toggle('services_require_deposit')} />
              <div>
                <p className="text-sm font-medium text-white flex items-center gap-1.5"><CreditCard size={13} className="text-gray-500" /> Require Deposit</p>
                <p className="text-[11px] text-gray-500">Stripe prepayment to confirm</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
