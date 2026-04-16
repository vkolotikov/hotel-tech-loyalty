import { useState } from 'react'
import {
  Globe, Shield, ExternalLink, Copy, Palette, Sun, Moon,
  Clock, Settings2, DollarSign, ToggleLeft, Zap, CreditCard,
} from 'lucide-react'

/**
 * Booking tab — extracted from Settings.tsx (was ~550 LOC inline). Owns all
 * its own state, type defs, and CRUD helpers; only needs the shared
 * settings-getter/setter and the styling tokens from the parent. Pulled out
 * because it's the largest of the eight tabs and was responsible for the bulk
 * of Settings.tsx's bloat.
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

export function BookingTab({ getVal, handleChange, widgetToken, cardClass, cardStyle, inputClass }: Props) {
  const widgetBaseUrl = typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost/hotel-tech/apps/loyalty/backend/public'
  const embedSnippet = `<!-- Hotel Tech Booking Widget -->\n<div id="hoteltech-booking"></div>\n<script src="${widgetBaseUrl}/widget/booking-loader.js"\n        data-org="${widgetToken}"></script>`
  const iframePreviewUrl = `${widgetBaseUrl}/booking-widget?org=${widgetToken}`
  const directBookingUrl = `${widgetBaseUrl}/book/${widgetToken}`

  const [embedCopied, setEmbedCopied] = useState(false)
  const [directUrlCopied, setDirectUrlCopied] = useState(false)

  const parseJsonSetting = <T,>(key: string, fallback: T): T => {
    const raw = getVal(key)
    if (!raw) return fallback
    try { return JSON.parse(raw) } catch { return fallback }
  }

  const bookingPolicies: BookingPolicies = parseJsonSetting('booking_policies', {
    check_in_time: '15:00', check_out_time: '11:00', cancellation_policy: '', payment_terms: '',
  })

  const updatePolicies = (policies: BookingPolicies) => handleChange('booking_policies', JSON.stringify(policies))

  const widgetTheme = getVal('booking_widget_theme') || 'light'
  const widgetColor = getVal('booking_widget_color') || '#2d6a4f'
  const widgetRadius = getVal('booking_widget_radius') || '12'
  return (
    <div className="space-y-6">

      {/* ── Section 1: Widget Embed & Preview ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Globe size={15} className="text-blue-400" /> Embeddable Booking Widget
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Copy the code below and paste it into any page on your website. Each company gets a unique widget scoped to their organization.
        </p>

        {!widgetToken ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
            <p className="text-xs text-amber-400">No organization found. Complete the setup wizard first to get your booking widget embed code.</p>
          </div>
        ) : (
          <>
            <div className="relative">
              <pre className="text-xs font-mono bg-black/40 border border-white/[0.06] rounded-xl p-4 overflow-x-auto text-gray-300 whitespace-pre-wrap">{embedSnippet}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(embedSnippet); setEmbedCopied(true); setTimeout(() => setEmbedCopied(false), 2000); }}
                className="absolute top-3 right-3 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all"
                style={{ background: embedCopied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: embedCopied ? '#22c55e' : '#8e8e93', border: embedCopied ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)' }}>
                {embedCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <Shield size={11} /> Widget Token: <code className="bg-white/[0.04] px-1.5 py-0.5 rounded text-gray-400 text-[10px]">{widgetToken}</code>
              </span>
              <a href={iframePreviewUrl} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors">
                <ExternalLink size={11} /> Preview widget
              </a>
            </div>

            {/* Direct Booking URL */}
            <div className="mt-4 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[11px] text-gray-400 font-semibold mb-2">Direct Booking URL</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-black/40 border border-white/[0.06] rounded-lg px-3 py-2 text-gray-300 overflow-x-auto">{directBookingUrl}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(directBookingUrl); setDirectUrlCopied(true); setTimeout(() => setDirectUrlCopied(false), 2000); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex-shrink-0"
                  style={{ background: directUrlCopied ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.06)', color: directUrlCopied ? '#22c55e' : '#8e8e93', border: directUrlCopied ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(255,255,255,0.08)' }}>
                  <Copy size={10} /> {directUrlCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[10px] text-gray-600 mt-1.5">A standalone booking page guests can navigate to directly.</p>
            </div>

            {/* Customization hint */}
            <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[11px] text-gray-500 leading-relaxed">
                <strong className="text-gray-400">Optional attributes:</strong>{' '}
                <code className="text-gray-400">data-lang="en"</code> for language,{' '}
                <code className="text-gray-400">data-primary-color="#c9a84c"</code> to match your brand,{' '}
                <code className="text-gray-400">data-container="my-id"</code> for a custom container element ID.
              </p>
            </div>
          </>
        )}
      </div>

      {/* ── Section 2: Widget Appearance ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Palette size={15} className="text-emerald-400" /> Widget Appearance
        </h3>
        <p className="text-xs text-gray-500 mb-5">Customize how the booking widget looks on your site.</p>

        <div className="space-y-4">
          {/* Theme toggle */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Theme</label>
              <p className="text-xs text-gray-500 mt-0.5">Light or dark mode for the widget</p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-white/[0.08] p-1" style={{ background: 'rgba(15,28,24,0.6)' }}>
              <button onClick={() => handleChange('booking_widget_theme', 'light')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetTheme === 'light' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <Sun size={12} /> Light
              </button>
              <button onClick={() => handleChange('booking_widget_theme', 'dark')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${widgetTheme === 'dark' ? 'bg-white/[0.1] text-white' : 'text-gray-500 hover:text-gray-300'}`}>
                <Moon size={12} /> Dark
              </button>
            </div>
          </div>

          {/* Primary Color */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Primary Color</label>
              <p className="text-xs text-gray-500 mt-0.5">Main accent color for buttons and highlights</p>
            </div>
            <div className="flex items-center gap-2 w-48">
              <input type="color" value={widgetColor}
                onChange={e => handleChange('booking_widget_color', e.target.value)}
                className="w-10 h-10 rounded-lg border border-white/[0.08] cursor-pointer bg-transparent p-0.5" />
              <input type="text" value={widgetColor}
                onChange={e => handleChange('booking_widget_color', e.target.value)}
                placeholder="#2d6a4f" maxLength={7}
                className={inputClass + ' flex-1 font-mono'} />
            </div>
          </div>

          {/* Border Radius */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Border Radius</label>
              <p className="text-xs text-gray-500 mt-0.5">Roundness of UI elements ({widgetRadius}px)</p>
            </div>
            <div className="flex items-center gap-3 w-48">
              <input type="range" min={0} max={24} value={Number(widgetRadius)}
                onChange={e => handleChange('booking_widget_radius', e.target.value)}
                className="flex-1 accent-emerald-500" />
              <span className="text-xs text-gray-400 font-mono w-8 text-right">{widgetRadius}px</span>
            </div>
          </div>

          {/* Property name and logo are hidden by default in the booking widget */}
        </div>

        {/* Live mini-preview */}
        <div className="mt-6">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-3">Live Preview</p>
          <div className="rounded-xl overflow-hidden border border-white/[0.08]"
            style={{
              borderRadius: `${widgetRadius}px`,
              background: widgetTheme === 'dark' ? '#1a1a2e' : '#ffffff',
              maxWidth: 360,
            }}>
            {/* Widget header — minimal, no name/logo */}
            <div className="px-4 py-2"
              style={{ borderBottom: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
              <span style={{ color: widgetTheme === 'dark' ? '#aaa' : '#666', fontSize: 11, fontWeight: 500 }}>Select your dates</span>
            </div>
            {/* Widget body mock */}
            <div className="p-4 space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 rounded-lg p-2" style={{
                  background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                }}>
                  <p style={{ fontSize: 9, color: widgetTheme === 'dark' ? '#aaa' : '#666', marginBottom: 2 }}>Check-in</p>
                  <p style={{ fontSize: 11, color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a', fontWeight: 600 }}>Apr 15, 2026</p>
                </div>
                <div className="flex-1 rounded-lg p-2" style={{
                  background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                  border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                  borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                }}>
                  <p style={{ fontSize: 9, color: widgetTheme === 'dark' ? '#aaa' : '#666', marginBottom: 2 }}>Check-out</p>
                  <p style={{ fontSize: 11, color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a', fontWeight: 600 }}>Apr 18, 2026</p>
                </div>
              </div>
              <div className="rounded-lg p-2.5" style={{
                background: widgetTheme === 'dark' ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)',
                border: `1px solid ${widgetTheme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}`,
                borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
              }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: widgetTheme === 'dark' ? '#fff' : '#1a1a1a' }}>Deluxe Room</p>
                <p style={{ fontSize: 10, color: widgetTheme === 'dark' ? '#aaa' : '#666' }}>2 guests &middot; King bed</p>
              </div>
              <button style={{
                width: '100%', padding: '8px 0', borderRadius: `${Math.max(4, Number(widgetRadius) - 4)}px`,
                backgroundColor: widgetColor, color: '#fff', fontSize: 11, fontWeight: 700, border: 'none', cursor: 'default',
              }}>Book Now</button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Policies ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Shield size={15} className="text-emerald-400" /> Policies
        </h3>
        <p className="text-xs text-gray-500 mb-5">Check-in/out times and booking policies shown to guests.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
              <Clock size={10} /> Check-in Time
            </label>
            <input type="text" value={bookingPolicies.check_in_time} placeholder="15:00"
              onChange={e => updatePolicies({ ...bookingPolicies, check_in_time: e.target.value })}
              className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1 flex items-center gap-1">
              <Clock size={10} /> Check-out Time
            </label>
            <input type="text" value={bookingPolicies.check_out_time} placeholder="11:00"
              onChange={e => updatePolicies({ ...bookingPolicies, check_out_time: e.target.value })}
              className={inputClass} />
          </div>
        </div>
        <div className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Cancellation Policy</label>
            <textarea value={bookingPolicies.cancellation_policy}
              onChange={e => updatePolicies({ ...bookingPolicies, cancellation_policy: e.target.value })}
              placeholder="e.g. Free cancellation up to 48 hours before check-in..."
              rows={3} className={inputClass} />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1">Payment Terms</label>
            <textarea value={bookingPolicies.payment_terms}
              onChange={e => updatePolicies({ ...bookingPolicies, payment_terms: e.target.value })}
              placeholder="e.g. Full payment required at time of booking..."
              rows={3} className={inputClass} />
          </div>
        </div>
      </div>

      {/* ── Section 6: General Booking Settings ── */}
      <div className={cardClass} style={cardStyle}>
        <h3 className="text-sm font-bold text-white mb-1 flex items-center gap-2">
          <Settings2 size={15} className="text-emerald-400" /> General Booking Settings
        </h3>
        <p className="text-xs text-gray-500 mb-5">Currency, stay limits, and system modes.</p>

        <div className="space-y-4">
          {/* Currency */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white flex items-center gap-1.5"><DollarSign size={13} className="text-gray-500" /> Currency</label>
              <p className="text-xs text-gray-500 mt-0.5">Currency used for pricing display</p>
            </div>
            <div className="w-40">
              <select value={getVal('booking_currency') || 'EUR'}
                onChange={e => handleChange('booking_currency', e.target.value)}
                className={inputClass + ' appearance-none cursor-pointer'} style={{ colorScheme: 'dark' }}>
                {CURRENCIES.map(c => <option key={c} value={c} style={{ background: '#0f1c18', color: '#fff' }}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Min Nights */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Minimum Nights</label>
              <p className="text-xs text-gray-500 mt-0.5">Minimum stay length required</p>
            </div>
            <div className="w-40">
              <input type="number" value={getVal('booking_min_nights') || '1'} min={1} max={30}
                onChange={e => handleChange('booking_min_nights', e.target.value)}
                className={inputClass} />
            </div>
          </div>

          {/* Max Nights */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white">Maximum Nights</label>
              <p className="text-xs text-gray-500 mt-0.5">Maximum stay length allowed</p>
            </div>
            <div className="w-40">
              <input type="number" value={getVal('booking_max_nights') || '30'} min={1} max={365}
                onChange={e => handleChange('booking_max_nights', e.target.value)}
                className={inputClass} />
            </div>
          </div>

          {/* Online Payment (Stripe) */}
          <div className="flex items-center justify-between py-2 border-b border-white/[0.04]">
            <div>
              <label className="block text-sm font-medium text-white flex items-center gap-1.5">
                <CreditCard size={13} className="text-gray-500" /> Online Payment
              </label>
              <p className="text-xs text-gray-500 mt-0.5">When enabled, guests can pay for their booking via Stripe during the reservation process. Requires Stripe API keys in Integrations.</p>
            </div>
            <button onClick={() => handleChange('booking_payment_enabled', (getVal('booking_payment_enabled') || 'false') === 'true' ? 'false' : 'true')}
              className={`relative w-12 h-6 rounded-full transition-colors ${(getVal('booking_payment_enabled') || 'false') === 'true' ? 'bg-emerald-500' : 'bg-white/[0.08]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${(getVal('booking_payment_enabled') || 'false') === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {(getVal('booking_payment_enabled') || 'false') === 'true' && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-[11px] text-emerald-400 flex items-center gap-1.5">
                <CreditCard size={11} /> Stripe payment is active. Make sure your Stripe API keys are configured in Settings &rarr; Integrations.
              </p>
            </div>
          )}
          {(getVal('booking_payment_enabled') || 'false') === 'true' && !getVal('stripe_secret_key') && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 mt-2">
              <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                <Zap size={11} /> Warning: No Stripe secret key detected. Payment will not work until keys are configured in Integrations.
              </p>
            </div>
          )}

          {/* Mock Mode */}
          <div className="flex items-center justify-between py-2">
            <div>
              <label className="block text-sm font-medium text-white flex items-center gap-1.5">
                <ToggleLeft size={13} className="text-gray-500" /> Mock Mode
              </label>
              <p className="text-xs text-gray-500 mt-0.5">When enabled, bookings are simulated and no real charges or emails are sent. Useful for testing.</p>
            </div>
            <button onClick={() => handleChange('booking_mock_mode', (getVal('booking_mock_mode') || 'false') === 'true' ? 'false' : 'true')}
              className={`relative w-12 h-6 rounded-full transition-colors ${(getVal('booking_mock_mode') || 'false') === 'true' ? 'bg-amber-500' : 'bg-white/[0.08]'}`}>
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-transform ${(getVal('booking_mock_mode') || 'false') === 'true' ? 'translate-x-6' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {(getVal('booking_mock_mode') || 'false') === 'true' && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="text-[11px] text-amber-400 flex items-center gap-1.5">
                <Zap size={11} /> Mock mode is active. All bookings will be simulated &mdash; no charges or confirmation emails will be sent.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  )
}
